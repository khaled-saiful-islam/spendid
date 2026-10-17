import { aiLimit, aiUsage, type Db } from "@spendid/db";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { ServiceError as AppError } from "../errors";
import type { AppSettingsStore } from "../settings";

/** Spoken seconds are billed as tokens so one allowance covers every AI feature. */
export const AUDIO_TOKENS_PER_SECOND = 25;
/** Requests per minute. Voice reads a long note phrase by phrase, so this leaves room for that. */
const BURST_LIMIT = 30;
const BURST_WINDOW_SECONDS = 60;

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

function monthKey(now = new Date()): string {
	return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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
	const usedKey = (userId: string) => `ai:used:${userId}:${monthKey()}`;

	async function usedThisMonth(userId: string): Promise<number> {
		const cached = await redis.get(usedKey(userId));
		if (cached !== null) return Number(cached);
		const now = new Date();
		const start = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
		);
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
		const app = deps.settings ? await deps.settings.get() : { aiEnabled: true, defaultMonthlyTokens: deps.defaultMonthlyTokens };
		return {
			enabled: deps.configured && app.aiEnabled && (limit?.enabled ?? true),
			pausedForEveryone: !app.aiEnabled,
			usedTokens: await usedThisMonth(userId),
			limitTokens: limit?.monthlyTokens ?? app.defaultMonthlyTokens,
		};
	}

	return {
		status,

		/** Throws a plain-language AppError when AI can't be used right now. */
		async assertAllowed(userId: string): Promise<void> {
			const s = await status(userId);
			if (s.pausedForEveryone)
				throw new AppError(403, "AI features are paused for a moment. You can still type expenses.");
			if (!s.enabled)
				throw new AppError(
					403,
					"AI is turned off for your account. You can still type expenses.",
				);
			if (s.usedTokens >= s.limitTokens) {
				throw new AppError(
					429,
					"You've used this month's AI allowance. You can still type expenses.",
				);
			}
			const burstKey = `ai:burst:${userId}`;
			const burst = await redis.incr(burstKey);
			if (burst === 1) await redis.expire(burstKey, BURST_WINDOW_SECONDS);
			if (burst > BURST_LIMIT)
				throw new AppError(
					429,
					"That's a lot of requests in a minute. Wait a moment and try again.",
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
			if (deps.onLimitReached && billedTokens > 0) {
				const { limitTokens } = await status(userId);
				if (after >= limitTokens && after - billedTokens < limitTokens)
					deps.onLimitReached(userId).catch(() => undefined);
			}
		},
	};
}

export type AiGuard = ReturnType<typeof createAiGuard>;
