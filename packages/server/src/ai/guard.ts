import { aiLimit, aiUsage, type Db } from "@spendid/db";
import { type AiUsage, summariseAiUsage } from "@spendid/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { ServiceError as AppError } from "../errors";
import type { AppSettingsStore } from "../settings";
import { allowanceMonth } from "./allowance-month";

/** Spoken seconds are billed as tokens so one allowance covers every AI feature. */
export const AUDIO_TOKENS_PER_SECOND = 25;
/** Requests per minute. Voice reads a long note phrase by phrase, so this leaves room for that. */
const BURST_LIMIT = 30;
const BURST_WINDOW_SECONDS = 60;
/** What a call is assumed to cost until its real count is recorded. */
const RESERVE_TOKENS = 2_000;
/** A call that dies without recording gives its room back after this. */
const RESERVE_SECONDS = 120;

/** Atomic: refuse when what's used plus what's in flight leaves no room, else hold one call's worth. */
const RESERVE = `
local held = tonumber(redis.call('GET', KEYS[1]) or '0')
if tonumber(ARGV[1]) + held >= tonumber(ARGV[2]) then return 0 end
redis.call('INCRBY', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1`;

const RELEASE = `
local left = redis.call('DECRBY', KEYS[1], ARGV[1])
if left <= 0 then redis.call('DEL', KEYS[1]) end
return left`;

export interface UsageRecord {
	feature: string;
	model: string;
	inputTokens?: number;
	outputTokens?: number;
	audioSeconds?: number;
}

export interface AiStatus {
	enabled: boolean;
	pausedForEveryone: boolean;
	usedTokens: number;
	limitTokens: number;
}

/**
 * Checks a person's AI allowance before a call and records counts after it.
 * Redis keeps the running monthly total; the ai_usage table is the permanent ledger.
 */
export function createAiGuard(deps: {
	db: Db;
	redis: Redis;
	defaultMonthlyTokens: number;
	configured: boolean;
	/** Admin-controlled switches; without it the env defaults apply. */
	settings?: AppSettingsStore;
	/** Called once when a call takes someone past their monthly allowance. Never awaited. */
	onLimitReached?: (userId: string) => Promise<unknown>;
}) {
	const { db, redis } = deps;
	// Months run in Malaysia time (allowanceMonth): a new month, a new key, a fresh allowance.
	const usedKey = (userId: string) =>
		`ai:month:${userId}:${allowanceMonth().key}`;
	const heldKey = (userId: string) =>
		`ai:held:${userId}:${allowanceMonth().key}`;

	async function usedThisMonth(userId: string): Promise<number> {
		const cached = await redis.get(usedKey(userId));
		if (cached !== null) return Number(cached);
		const { start } = allowanceMonth();
		const [row] = await db
			.select({ total: sql<string>`coalesce(sum(${aiUsage.billedTokens}), 0)` })
			.from(aiUsage)
			.where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, start)));
		const total = Number(row?.total ?? 0);
		await redis.set(usedKey(userId), total, "EX", 40 * 86_400);
		return total;
	}

	async function status(userId: string): Promise<AiStatus> {
		const [limit] = await db
			.select()
			.from(aiLimit)
			.where(eq(aiLimit.userId, userId))
			.limit(1);
		const app = deps.settings
			? await deps.settings.get()
			: { aiEnabled: true, defaultMonthlyTokens: deps.defaultMonthlyTokens };
		return {
			enabled: deps.configured && app.aiEnabled && (limit?.enabled ?? true),
			pausedForEveryone: !app.aiEnabled,
			usedTokens: await usedThisMonth(userId),
			limitTokens: limit?.monthlyTokens ?? app.defaultMonthlyTokens,
		};
	}

	/** This month's ledger by feature, in everyday terms, for the person's own allowance view. */
	async function usage(userId: string): Promise<AiUsage> {
		const s = await status(userId);
		const { start, resetsOn } = allowanceMonth();
		const rows = await db
			.select({
				feature: aiUsage.feature,
				tokens: sql<number>`coalesce(sum(${aiUsage.billedTokens}), 0)::int`,
				rows: sql<number>`count(*)::int`,
			})
			.from(aiUsage)
			.where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, start)))
			.groupBy(aiUsage.feature);
		return {
			...s,
			resetsOn,
			...summariseAiUsage(rows, s.usedTokens, s.limitTokens),
		};
	}

	return {
		status,
		usage,

		/** Throws a plain-language AppError when AI can't be used right now. */
		async assertAllowed(userId: string): Promise<void> {
			const s = await status(userId);
			if (s.pausedForEveryone)
				throw new AppError(
					403,
					"AI features are paused for a moment. You can still type expenses.",
				);
			if (!s.enabled)
				throw new AppError(
					403,
					"AI is turned off for your account. You can still type expenses.",
				);
			const burstKey = `ai:burst:${userId}`;
			// One round trip, and the expiry is set even on a counter that lost it.
			const [[, burst] = []] =
				(await redis
					.multi()
					.incr(burstKey)
					.expire(burstKey, BURST_WINDOW_SECONDS, "NX")
					.exec()) ?? [];
			if (Number(burst) > BURST_LIMIT)
				throw new AppError(
					429,
					"That's a lot of requests in a minute. Wait a moment and try again.",
				);
			// Calls that arrive together each hold room, so they can't all slip past the limit.
			const held = await redis.eval(
				RESERVE,
				1,
				heldKey(userId),
				s.usedTokens,
				s.limitTokens,
				RESERVE_TOKENS,
				RESERVE_SECONDS,
			);
			if (held !== 1)
				throw new AppError(
					429,
					"You've used this month's AI allowance. You can still type expenses.",
				);
		},

		async record(userId: string, usage: UsageRecord): Promise<void> {
			const inputTokens = usage.inputTokens ?? 0;
			const outputTokens = usage.outputTokens ?? 0;
			const audioSeconds = Math.ceil(usage.audioSeconds ?? 0);
			const billedTokens =
				inputTokens + outputTokens + audioSeconds * AUDIO_TOKENS_PER_SECOND;
			// Warm the cached total first, so the row inserted below is added exactly once.
			await usedThisMonth(userId);
			await db.insert(aiUsage).values({
				userId,
				feature: usage.feature,
				model: usage.model,
				inputTokens,
				outputTokens,
				audioSeconds,
				billedTokens,
			});
			const after = await redis.incrby(usedKey(userId), billedTokens);
			await redis.eval(RELEASE, 1, heldKey(userId), RESERVE_TOKENS);
			if (deps.onLimitReached && billedTokens > 0) {
				const { limitTokens } = await status(userId);
				if (after >= limitTokens && after - billedTokens < limitTokens)
					deps.onLimitReached(userId).catch(() => undefined);
			}
		},
	};
}

export type AiGuard = ReturnType<typeof createAiGuard>;
