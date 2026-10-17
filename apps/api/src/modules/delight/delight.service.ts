import { type Db, profile, wish } from "@spendid/db";
import {
	hoursOfWork,
	WISH_COOLDOWN_HOURS,
	type Wish,
	WishDecisionSchema,
	type WishInput,
	WishInputSchema,
	type WishList,
} from "@spendid/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { badRequest, notFound } from "../../http/app-error";

const MAX_WAITING = 30;

/** The impulse-pause wishlist. Everything scoped to one person. */
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
