import { checkIn, type Db, profile, transaction, wish } from "@spendid/db";
import {
	CheckInSchema,
	computeStreak,
	hoursOfWork,
	type Streak,
	WISH_COOLDOWN_HOURS,
	type Wish,
	WishDecisionSchema,
	type WishInput,
	WishInputSchema,
	type WishList,
} from "@spendid/shared";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { badRequest, notFound } from "../../http/app-error";
import { localParts } from "../../notify/notifier";

/** From this local hour, an unanswered day shows "Anything I missed today?". */
const CHECK_IN_FROM_HOUR = 20;
const MAX_WAITING = 30;

/** Streaks, the nightly check-in and the impulse-pause wishlist. Everything scoped to one person. */
export function createDelightService(db: Db) {
	async function me(userId: string) {
		const [p] = await db
			.select({
				timeZone: profile.timeZone,
				currency: profile.homeCurrency,
				income: profile.monthlyIncomeMinor,
			})
			.from(profile)
			.where(eq(profile.userId, userId))
			.limit(1);
		return {
			timeZone: p?.timeZone ?? "UTC",
			currency: p?.currency ?? "MYR",
			income: p?.income ?? null,
		};
	}

	function toWish(row: typeof wish.$inferSelect, income: number | null): Wish {
		return {
			id: row.id,
			name: row.name,
			priceMinor: row.priceMinor,
			currency: row.currency,
			link: row.link,
			createdAt: row.createdAt.toISOString(),
			coolUntil: row.coolUntil.toISOString(),
			decision: row.decision,
			decidedAt: row.decidedAt?.toISOString() ?? null,
			hoursOfWork: hoursOfWork(row.priceMinor, income),
		};
	}

	return {
		async streak(userId: string): Promise<Streak> {
			const { timeZone } = await me(userId);
			const local = localParts(timeZone);
			const [spendDays, checks] = await Promise.all([
				db
					.selectDistinct({
						day: sql<string>`(${transaction.occurredAt} at time zone ${timeZone})::date::text`,
					})
					.from(transaction)
					.where(
						and(
							eq(transaction.userId, userId),
							isNull(transaction.deletedAt),
							gte(transaction.occurredAt, sql`now() - interval '400 days'`),
						),
					),
				db
					.select({ day: checkIn.day })
					.from(checkIn)
					.where(
						and(
							eq(checkIn.userId, userId),
							gte(checkIn.day, sql`(current_date - 400)`),
						),
					),
			]);
			const s = computeStreak(
				[...spendDays.map((d) => d.day), ...checks.map((c) => c.day)],
				local.date,
			);
			const checkedInToday = checks.some((c) => c.day === local.date);
			return {
				...s,
				checkedInToday,
				checkInDue: local.hour >= CHECK_IN_FROM_HOUR && !checkedInToday,
			};
		},

		async checkIn(userId: string, raw: unknown): Promise<Streak> {
			const { kind } = CheckInSchema.parse(raw);
			const { timeZone } = await me(userId);
			const day = localParts(timeZone).date;
			await db
				.insert(checkIn)
				.values({ userId, day, kind })
				.onConflictDoUpdate({
					target: [checkIn.userId, checkIn.day],
					set: { kind },
				});
			return this.streak(userId);
		},

		async wishes(userId: string): Promise<WishList> {
			const { currency, income } = await me(userId);
			const rows = await db
				.select()
				.from(wish)
				.where(eq(wish.userId, userId))
				.orderBy(desc(wish.createdAt))
				.limit(100);
			const all = rows.map((r) => toWish(r, income));
			return {
				waiting: all.filter((w) => !w.decision),
				decided: all.filter((w) => w.decision).slice(0, 20),
				savedMinor: rows
					.filter((r) => r.decision === "skipped" && r.currency === currency)
					.reduce((s, r) => s + r.priceMinor, 0),
				currency,
			};
		},

		async addWish(userId: string, raw: WishInput): Promise<Wish> {
			const input = WishInputSchema.parse(raw);
			const [{ n } = { n: 0 }] = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(wish)
				.where(and(eq(wish.userId, userId), isNull(wish.decision)));
			if (n >= MAX_WAITING)
				throw badRequest("That's a long wishlist. Decide on a few first.");
			const { income } = await me(userId);
			const [row] = await db
				.insert(wish)
				.values({
					userId,
					name: input.name,
					priceMinor: input.priceMinor,
					currency: input.currency,
					link: input.link ?? null,
					coolUntil: new Date(Date.now() + WISH_COOLDOWN_HOURS * 3_600_000),
				})
				.returning();
			if (!row) throw new Error("wish insert returned nothing");
			return toWish(row, income);
		},

		async decide(userId: string, id: string, raw: unknown): Promise<Wish> {
			const { decision } = WishDecisionSchema.parse(raw);
			const { income } = await me(userId);
			const [row] = await db
				.update(wish)
				.set({ decision, decidedAt: new Date() })
				.where(
					and(eq(wish.id, id), eq(wish.userId, userId), isNull(wish.decision)),
				)
				.returning();
			if (!row) throw notFound("Wish");
			return toWish(row, income);
		},

		async remove(userId: string, id: string): Promise<void> {
			const rows = await db
				.delete(wish)
				.where(and(eq(wish.id, id), eq(wish.userId, userId)))
				.returning({ id: wish.id });
			if (rows.length === 0) throw notFound("Wish");
		},
	};
}

export type DelightService = ReturnType<typeof createDelightService>;
