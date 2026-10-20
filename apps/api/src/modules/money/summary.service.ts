import {
	type Db,
	goal,
	monthlyTransfer,
	profile,
	transaction,
} from "@spendid/db";
import {
	type BudgetMethod,
	computeSafeToSpend,
	goalMonthlyNeeded,
	reservedSavings,
	type Summary,
} from "@spendid/shared";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { recurringFor } from "../insights/charges";
import { onLocalDays } from "./local-days";
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
			const method: BudgetMethod | null = p?.budgetMethod ?? null;
			const incomeMinor = p?.monthlyIncomeMinor ?? null;
			const bounds = await monthBounds(db, timeZone);

			const localDay = sql`(${transaction.occurredAt} at time zone ${timeZone})::date`;
			const inMonth = and(
				eq(transaction.userId, userId),
				isNull(transaction.deletedAt),
				onLocalDays(
					transaction.occurredAt,
					timeZone,
					bounds.monthStart,
					bounds.nextMonth,
				),
			);

			const [totals, byCategory, todayRows, goals, recurring, transfers] =
				await Promise.all([
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
					recurringFor(db, userId),
					db
						.select({
							name: monthlyTransfer.name,
							amountMinor: monthlyTransfer.amountMinor,
						})
						.from(monthlyTransfer)
						.where(eq(monthlyTransfer.userId, userId))
						.orderBy(
							asc(monthlyTransfer.position),
							asc(monthlyTransfer.createdAt),
						),
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
				transfersMinor: transfers.reduce((sum, t) => sum + t.amountMinor, 0),
			});

			return {
				homeCurrency,
				method,
				incomeMinor,
				reservedMinor,
				// Kept when switching plans, but only counted while this plan is on.
				transfers: method === "pay_yourself_first" ? transfers : [],
				daysLeft: bounds.daysLeft,
				monthSpentMinor: spentBeforeTodayMinor + spentTodayMinor,
				safe: computeSafeToSpend({
					incomeMinor,
					reservedMinor,
					billsDueMinor: recurring.billsDue.minor,
					spentBeforeTodayMinor,
					spentTodayMinor,
					daysLeft: bounds.daysLeft,
				}),
				today: todayRows.map(toDto),
				byCategory: byCategory.map((c) => ({
					categoryId: c.categoryId,
					spentMinor: Number(c.spentMinor),
				})),
				bills: recurring.billsDue,
			};
		},
	};
}

export type SummaryService = ReturnType<typeof createSummaryService>;
