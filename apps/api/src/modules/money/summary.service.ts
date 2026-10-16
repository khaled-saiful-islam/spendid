import { type Db, goal, profile, transaction } from "@spendid/db";
import {
	type BudgetMethod,
	computeSafeToSpend,
	goalMonthlyNeeded,
	reservedSavings,
	type Summary,
} from "@spendid/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { toDto } from "./transactions.repository";

export interface MonthBounds {
	today: string;
	monthStart: string;
	nextMonth: string;
	daysLeft: number;
}

/** Today and this month, in the person's own time zone. */
export async function monthBounds(
	db: Db,
	timeZone: string,
): Promise<MonthBounds> {
	const result = await db.execute<{
		today: string;
		month_start: string;
		next_month: string;
		days_left: number;
	}>(sql`
		select
			(now() at time zone ${timeZone})::date::text as today,
			date_trunc('month', now() at time zone ${timeZone})::date::text as month_start,
			(date_trunc('month', now() at time zone ${timeZone}) + interval '1 month')::date::text as next_month,
			((date_trunc('month', now() at time zone ${timeZone}) + interval '1 month')::date
				- (now() at time zone ${timeZone})::date)::int as days_left`);
	const row = result[0];
	if (!row) throw new Error("could not compute month bounds");
	return {
		today: row.today,
		monthStart: row.month_start,
		nextMonth: row.next_month,
		daysLeft: row.days_left,
	};
}

/** Everything the home screen needs in one call. */
export function createSummaryService(db: Db) {
	return {
		async forUser(userId: string): Promise<Summary> {
			const [p] = await db
				.select()
				.from(profile)
				.where(eq(profile.userId, userId))
				.limit(1);
			const timeZone = p?.timeZone ?? "UTC";
			const homeCurrency = p?.homeCurrency ?? "MYR";
			const method: BudgetMethod = p?.budgetMethod ?? "fifty_thirty_twenty";
			const incomeMinor = p?.monthlyIncomeMinor ?? null;
			const bounds = await monthBounds(db, timeZone);

			const localDay = sql`(${transaction.occurredAt} at time zone ${timeZone})::date`;
			const inMonth = and(
				eq(transaction.userId, userId),
				isNull(transaction.deletedAt),
				sql`${localDay} >= ${bounds.monthStart}::date`,
				sql`${localDay} < ${bounds.nextMonth}::date`,
			);

			const [totals, byCategory, todayRows, goals] = await Promise.all([
				db
					.select({
						before: sql<string>`coalesce(sum(${transaction.homeAmountMinor}) filter (where ${localDay} < ${bounds.today}::date), 0)`,
						today: sql<string>`coalesce(sum(${transaction.homeAmountMinor}) filter (where ${localDay} = ${bounds.today}::date), 0)`,
					})
					.from(transaction)
					.where(inMonth),
				db
					.select({
						categoryId: transaction.categoryId,
						spentMinor: sql<string>`sum(${transaction.homeAmountMinor})`,
					})
					.from(transaction)
					.where(inMonth)
					.groupBy(transaction.categoryId),
				db
					.select()
					.from(transaction)
					.where(and(inMonth, sql`${localDay} = ${bounds.today}::date`))
					.orderBy(desc(transaction.occurredAt)),
				db
					.select({
						targetMinor: goal.targetMinor,
						savedMinor: goal.savedMinor,
						targetDate: goal.targetDate,
					})
					.from(goal)
					.where(and(eq(goal.userId, userId), isNull(goal.archivedAt))),
			]);

			const spentBeforeTodayMinor = Number(totals[0]?.before ?? 0);
			const spentTodayMinor = Number(totals[0]?.today ?? 0);
			const goalsMonthlyMinor = goals.reduce(
				(sum, g) => sum + goalMonthlyNeeded(g, bounds.today),
				0,
			);
			const reservedMinor = reservedSavings({
				incomeMinor,
				method,
				goalsMonthlyMinor,
			});

			return {
				homeCurrency,
				method,
				incomeMinor,
				reservedMinor,
				daysLeft: bounds.daysLeft,
				monthSpentMinor: spentBeforeTodayMinor + spentTodayMinor,
				safe: computeSafeToSpend({
					incomeMinor,
					reservedMinor,
					spentBeforeTodayMinor,
					spentTodayMinor,
					daysLeft: bounds.daysLeft,
				}),
				today: todayRows.map(toDto),
				byCategory: byCategory.map((c) => ({
					categoryId: c.categoryId,
					spentMinor: Number(c.spentMinor),
				})),
			};
		},
	};
}

export type SummaryService = ReturnType<typeof createSummaryService>;
