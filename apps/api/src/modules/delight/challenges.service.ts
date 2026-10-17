import {
	category,
	challenge,
	checkIn,
	type Db,
	profile,
	transaction,
} from "@spendid/db";
import {
	type ChallengeBoard,
	type ChallengeDay,
	type ChallengeKind,
	type ChallengeView,
	challengeWindow,
	FIXED_COST_SLUGS,
	judgeChallenge,
	StartChallengeSchema,
} from "@spendid/shared";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { badRequest, notFound } from "../../http/app-error";
import { localParts } from "../../notify/notifier";
import { onLocalDays } from "../money/local-days";

const MAX_ACTIVE = 2;
const roundTo = (minor: number, step: number) =>
	Math.max(step, Math.round(minor / step) * step);

type Row = typeof challenge.$inferSelect;

/** Challenges people start; each is judged from their own spending in its window. */
export function createChallengeService(db: Db) {
	async function home(userId: string) {
		const [p] = await db
			.select({ timeZone: profile.timeZone, currency: profile.homeCurrency })
			.from(profile)
			.where(eq(profile.userId, userId))
			.limit(1);
		const timeZone = p?.timeZone ?? "UTC";
		return {
			timeZone,
			currency: p?.currency ?? "MYR",
			today: localParts(timeZone).date,
		};
	}

	/** Per-day spending that counts (fixed costs left out), by category, plus check-ins. */
	async function daysFor(
		userId: string,
		timeZone: string,
		start: string,
		end: string,
	): Promise<ChallengeDay[]> {
		const localDay = sql<string>`(${transaction.occurredAt} at time zone ${timeZone})::date::text`;
		const [rows, checks] = await Promise.all([
			db
				.select({
					day: localDay,
					slug: category.slug,
					minor: sql<string>`sum(${transaction.homeAmountMinor})`,
					count: sql<number>`count(*)::int`,
				})
				.from(transaction)
				.innerJoin(category, eq(category.id, transaction.categoryId))
				.where(
					and(
						eq(transaction.userId, userId),
						isNull(transaction.deletedAt),
						onLocalDays(
							transaction.occurredAt,
							timeZone,
							start,
							sql`${end}::date + 1`,
						),
					),
				)
				// By position: the day expression carries its own time-zone parameter.
				.groupBy(sql`1`, sql`2`),
			db
				.select({ day: checkIn.day })
				.from(checkIn)
				.where(
					and(
						eq(checkIn.userId, userId),
						gte(checkIn.day, start),
						lte(checkIn.day, end),
					),
				),
		]);
		const fixed = new Set<string>(FIXED_COST_SLUGS);
		const byDay = new Map<string, ChallengeDay>();
		const get = (day: string) => {
			const d = byDay.get(day) ?? { day, minor: 0, bySlug: {}, active: false };
			byDay.set(day, d);
			return d;
		};
		for (const r of rows) {
			const d = get(r.day);
			d.active = true;
			if (fixed.has(r.slug)) continue;
			d.minor += Number(r.minor);
			d.bySlug[r.slug] = { minor: Number(r.minor), count: r.count };
		}
		for (const c of checks) get(c.day).active = true;
		return [...byDay.values()];
	}

	/** Judges a challenge from days already read (days outside its window are ignored). */
	function view(
		row: Row,
		today: string,
		currency: string,
		days: ChallengeDay[],
	): ChallengeView {
		return {
			id: row.id,
			kind: row.kind as ChallengeKind,
			targetMinor: row.targetMinor,
			currency,
			start: row.startDay,
			end: row.endDay,
			gaveUp: row.outcome === "gave-up",
			result: judgeChallenge({
				kind: row.kind as ChallengeKind,
				targetMinor: row.targetMinor,
				start: row.startDay,
				end: row.endDay,
				today,
				days,
			}),
		};
	}

	/** A won challenge is settled: show it without reading its days again. */
	function wonView(row: Row, currency: string): ChallengeView {
		return {
			id: row.id,
			kind: row.kind as ChallengeKind,
			targetMinor: row.targetMinor,
			currency,
			start: row.startDay,
			end: row.endDay,
			gaveUp: false,
			result: { status: "won", days: [], usedMinor: null },
		};
	}

	const fourWeeksBefore = (today: string) =>
		new Date(Date.parse(`${today}T00:00:00Z`) - 28 * 86_400_000)
			.toISOString()
			.slice(0, 10);

	/** Suggested caps from the last four weeks: a little under the usual. */
	function suggestionsFrom(days: ChallengeDay[], today: string) {
		const from = fourWeeksBefore(today);
		const recent = days.filter((d) => d.day >= from && d.day <= today);
		const food = recent.reduce((n, d) => n + (d.bySlug.food?.minor ?? 0), 0);
		const flexible = recent.reduce((n, d) => n + d.minor, 0);
		return {
			eatOutWeekMinor: roundTo((food / 4) * 0.8, 1_000),
			dailyMinor: roundTo((flexible / 28) * 0.85, 500),
		};
	}

	async function suggestions(userId: string, timeZone: string, today: string) {
		const days = await daysFor(userId, timeZone, fourWeeksBefore(today), today);
		return suggestionsFrom(days, today);
	}

	return {
		async board(userId: string): Promise<ChallengeBoard> {
			const { timeZone, currency, today } = await home(userId);
			const rows = await db
				.select()
				.from(challenge)
				.where(
					and(
						eq(challenge.userId, userId),
						or(isNull(challenge.outcome), eq(challenge.outcome, "won")),
					),
				)
				.orderBy(desc(challenge.createdAt))
				.limit(30);
			// One read of daily spending covers every open challenge and the suggestions.
			const open = rows.filter((r) => r.outcome === null);
			const from = [fourWeeksBefore(today), ...open.map((r) => r.startDay)]
				.sort()
				.at(0);
			const days = await daysFor(userId, timeZone, from ?? today, today);
			const active: ChallengeView[] = [];
			const won: ChallengeView[] = [];
			for (const row of rows) {
				if (row.outcome === "won") {
					won.push(wonView(row, currency));
					continue;
				}
				const v = view(row, today, currency, days);
				if (row.outcome === null && v.result.status !== "active") {
					// Decided now: remember it, so it isn't judged again.
					await db
						.update(challenge)
						.set({ outcome: v.result.status, endedAt: new Date() })
						.where(eq(challenge.id, row.id));
				}
				if (row.outcome === null && v.result.status === "active")
					active.push(v);
				else if (row.outcome === "won" || v.result.status === "won")
					won.push(v);
				else if (row.outcome === null && v.result.status === "lost")
					active.push(v);
			}
			return {
				today,
				active,
				won: won.slice(0, 12),
				suggested: suggestionsFrom(days, today),
			};
		},

		async start(userId: string, raw: unknown): Promise<ChallengeView> {
			const input = StartChallengeSchema.parse(raw);
			const { timeZone, currency, today } = await home(userId);
			const capped = input.kind === "eat-out-cap" || input.kind === "daily-cap";
			const s =
				capped && !input.targetMinor
					? await suggestions(userId, timeZone, today)
					: null;
			const window = challengeWindow(input.kind, today);
			// Check and insert under a per-person lock, so quick taps can't pass the checks together.
			const row = await db.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext(${`challenge:${userId}`}))`,
				);
				const running = await tx
					.select({ kind: challenge.kind })
					.from(challenge)
					.where(and(eq(challenge.userId, userId), isNull(challenge.outcome)));
				if (running.some((r) => r.kind === input.kind))
					throw badRequest("That challenge is already running.");
				if (running.length >= MAX_ACTIVE)
					throw badRequest(
						"Two challenges at a time is plenty. Finish one first.",
					);
				const [inserted] = await tx
					.insert(challenge)
					.values({
						userId,
						kind: input.kind,
						targetMinor: capped
							? (input.targetMinor ??
								(input.kind === "eat-out-cap"
									? s?.eatOutWeekMinor
									: s?.dailyMinor) ??
								null)
							: null,
						startDay: window.start,
						endDay: window.end,
					})
					.returning();
				return inserted;
			});
			if (!row) throw new Error("challenge insert returned nothing");
			const days = await daysFor(
				userId,
				timeZone,
				row.startDay,
				row.endDay < today ? row.endDay : today,
			);
			return view(row, today, currency, days);
		},

		async giveUp(userId: string, id: string): Promise<void> {
			const done = await db
				.update(challenge)
				.set({ outcome: "gave-up", endedAt: new Date() })
				.where(
					and(
						eq(challenge.userId, userId),
						eq(challenge.id, id),
						isNull(challenge.outcome),
					),
				)
				.returning({ id: challenge.id });
			if (done.length === 0) throw notFound("Challenge");
		},
	};
}

export type ChallengeService = ReturnType<typeof createChallengeService>;
