import { category, type Db, goal, goalDeposit, transaction } from "@spendid/db";
import {
	type Heatmap,
	moneyPersonality,
	type RecurringOverview,
	type Wrapped,
} from "@spendid/shared";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { badRequest } from "../../http/app-error";
import { monthBounds } from "../money/summary.service";
import { homeOf, recurringFor } from "./charges";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthRange(month: string): {
	start: string;
	next: string;
	days: number;
} {
	const [y, m] = month.split("-").map(Number) as [number, number];
	const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
	const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return { start: `${month}-01`, next, days };
}

const previousMonth = (month: string) => {
	const [y, m] = month.split("-").map(Number) as [number, number];
	return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};

// Grouping by a time-zone expression must use the column position: the zone is a bound
// parameter, so Postgres can't match the select and group-by expressions.

/** Read-only views over one person's spending: subscriptions, heatmap, Money Wrapped. */
export function createInsightsService(db: Db) {
	/** Spending in [start, next) by the person's local day. */
	function inRange(
		userId: string,
		timeZone: string,
		start: string,
		next: string,
	) {
		const localDay = sql`(${transaction.occurredAt} at time zone ${timeZone})::date`;
		return {
			localDay,
			where: and(
				eq(transaction.userId, userId),
				isNull(transaction.deletedAt),
				sql`${localDay} >= ${start}::date`,
				sql`${localDay} < ${next}::date`,
			),
		};
	}

	async function resolveMonth(month: string | undefined, timeZone: string) {
		const bounds = await monthBounds(db, timeZone);
		const current = bounds.today.slice(0, 7);
		const chosen = month ?? current;
		if (!MONTH.test(chosen) || chosen > current)
			throw badRequest("Pick a month up to this one.");
		return { chosen, today: bounds.today, inProgress: chosen === current };
	}

	return {
		recurring: (userId: string): Promise<RecurringOverview> =>
			recurringFor(db, userId),

		async heatmap(userId: string, month?: string): Promise<Heatmap> {
			const { currency, timeZone } = await homeOf(db, userId);
			const { chosen, today } = await resolveMonth(month, timeZone);
			const { start, next } = monthRange(chosen);
			const { localDay, where } = inRange(userId, timeZone, start, next);
			const rows = await db
				.select({
					day: sql<string>`${localDay}::text`,
					minor: sql<string>`sum(${transaction.homeAmountMinor})`,
					count: sql<number>`count(*)::int`,
				})
				.from(transaction)
				.where(where)
				.groupBy(sql`1`);
			const days = rows.map((r) => ({
				day: r.day,
				minor: Number(r.minor),
				count: r.count,
			}));
			return {
				month: chosen,
				currency,
				today,
				days,
				maxMinor: Math.max(0, ...days.map((d) => d.minor)),
			};
		},

		async wrapped(userId: string, month?: string): Promise<Wrapped> {
			const { currency, timeZone } = await homeOf(db, userId);
			const { chosen, inProgress, today } = await resolveMonth(month, timeZone);
			const { start, next, days: daysInMonth } = monthRange(chosen);
			const prev = monthRange(previousMonth(chosen));
			const now = inRange(userId, timeZone, start, next);
			const before = inRange(userId, timeZone, prev.start, prev.next);
			const total = sql<string>`coalesce(sum(${transaction.homeAmountMinor}), 0)`;

			const [
				[sum],
				[prevSum],
				cats,
				daily,
				merchants,
				weekdays,
				[saved],
				recurring,
			] = await Promise.all([
				db
					.select({ total, count: sql<number>`count(*)::int` })
					.from(transaction)
					.where(now.where),
				db.select({ total }).from(transaction).where(before.where),
				db
					.select({
						slug: category.slug,
						name: category.name,
						icon: category.icon,
						tint: category.tint,
						kind: category.kind,
						minor: total,
					})
					.from(transaction)
					.innerJoin(category, eq(category.id, transaction.categoryId))
					.where(now.where)
					.groupBy(
						category.id,
						category.slug,
						category.name,
						category.icon,
						category.tint,
						category.kind,
					)
					.orderBy(desc(total)),
				db
					.select({
						day: sql<string>`${now.localDay}::text`,
						minor: total,
						count: sql<number>`count(*)::int`,
					})
					.from(transaction)
					.where(now.where)
					.groupBy(sql`1`)
					.orderBy(desc(total)),
				db
					.select({
						name: transaction.merchant,
						visits: sql<number>`count(*)::int`,
						minor: total,
					})
					.from(transaction)
					.where(and(now.where, sql`${transaction.merchant} is not null`))
					.groupBy(transaction.merchant)
					.orderBy(desc(sql`count(*)`), desc(total))
					.limit(1),
				db
					.select({
						weekday: sql<number>`extract(dow from ${now.localDay})::int`,
						minor: total,
					})
					.from(transaction)
					.where(now.where)
					.groupBy(sql`1`)
					.orderBy(desc(total))
					.limit(1),
				db
					.select({
						minor: sql<string>`coalesce(sum(${goalDeposit.amountMinor}), 0)`,
					})
					.from(goalDeposit)
					.innerJoin(goal, eq(goal.id, goalDeposit.goalId))
					.where(
						and(
							eq(goalDeposit.userId, userId),
							gt(goalDeposit.amountMinor, 0),
							sql`(${goalDeposit.createdAt} at time zone ${timeZone})::date >= ${start}::date`,
							sql`(${goalDeposit.createdAt} at time zone ${timeZone})::date < ${next}::date`,
						),
					),
				recurringFor(db, userId),
			]);

			const totalMinor = Number(sum?.total ?? 0);
			const kinds = { need: 0, want: 0, saving: 0 };
			for (const c of cats) kinds[c.kind] += Number(c.minor);
			const elapsed = inProgress ? Number(today.slice(8, 10)) : daysInMonth;
			const noSpendDays = Math.max(0, elapsed - daily.length);
			const top = cats[0];
			const biggest = daily[0];
			return {
				month: chosen,
				inProgress,
				currency,
				totalMinor,
				previousMinor: Number(prevSum?.total ?? 0),
				count: sum?.count ?? 0,
				activeDays: daily.length,
				noSpendDays,
				categories: cats.slice(0, 5).map((c) => ({
					name: c.name,
					icon: c.icon,
					tint: c.tint,
					minor: Number(c.minor),
					share: totalMinor ? Number(c.minor) / totalMinor : 0,
				})),
				biggestDay: biggest
					? {
							day: biggest.day,
							minor: Number(biggest.minor),
							count: biggest.count,
						}
					: null,
				topMerchant: merchants[0]?.name
					? {
							name: merchants[0].name,
							visits: merchants[0].visits,
							minor: Number(merchants[0].minor),
						}
					: null,
				busiestWeekday: weekdays[0]
					? { weekday: weekdays[0].weekday, minor: Number(weekdays[0].minor) }
					: null,
				kinds,
				savedMinor: Number(saved?.minor ?? 0),
				subscriptionsMonthlyMinor: recurring.items
					.filter((r) => r.cadence !== "weekly")
					.reduce((s, r) => s + r.monthlyMinor, 0),
				personality: moneyPersonality({
					kinds,
					topCategorySlug: top?.slug ?? null,
					topShare: top && totalMinor ? Number(top.minor) / totalMinor : 0,
					noSpendDays,
					daysInMonth: elapsed,
				}),
			};
		},
	};
}

export type InsightsService = ReturnType<typeof createInsightsService>;
