import {
	type Db,
	goal,
	monthlyTransfer,
	profile,
	transaction,
} from "@spendid/db";
import {
	addDays,
	type BudgetMethod,
	computeSafeToSpend,
	daysInclusive,
	goalCycleNeeded,
	goalMonthlyNeeded,
	reservedSavings,
	type Summary,
} from "@spendid/shared";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { recurringFor } from "../insights/charges";
import { onLocalDays } from "./local-days";
import { type PeriodBounds, periodBounds } from "./period";
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

/** Everything the home screen needs in one call, for the current period. */
export function createSummaryService(db: Db) {
	/** The summary for any period (the current one, or one being previewed). */
	async function forBounds(
		userId: string,
		bounds: PeriodBounds,
		method: BudgetMethod | null,
	): Promise<Summary> {
		const [p] = await db
			.select()
			.from(profile)
			.where(eq(profile.userId, userId))
			.limit(1);
		const timeZone = p?.timeZone ?? "UTC";
		const homeCurrency = p?.homeCurrency ?? "MYR";
		const incomeMinor = bounds.incomeMinor;

		const localDay = sql`(${transaction.occurredAt} at time zone ${timeZone})::date`;
		const inPeriod = and(
			eq(transaction.userId, userId),
			isNull(transaction.deletedAt),
			onLocalDays(
				transaction.occurredAt,
				timeZone,
				bounds.start,
				bounds.nextStart,
			),
		);

		const [totals, byCategory, byDay, todayRows, goals, recurring, transfers] =
			await Promise.all([
				db
					.select({
						before: sql<string>`coalesce(sum(${transaction.homeAmountMinor}) filter (where ${localDay} < ${bounds.today}::date), 0)`,
						today: sql<string>`coalesce(sum(${transaction.homeAmountMinor}) filter (where ${localDay} = ${bounds.today}::date), 0)`,
					})
					.from(transaction)
					.where(inPeriod),
				db
					.select({
						categoryId: transaction.categoryId,
						spentMinor: sql<string>`sum(${transaction.homeAmountMinor})`,
					})
					.from(transaction)
					.where(inPeriod)
					.groupBy(transaction.categoryId),
				db
					.select({
						day: sql<string>`${localDay}::text`,
						minor: sql<string>`sum(${transaction.homeAmountMinor})`,
					})
					.from(transaction)
					.where(and(inPeriod, sql`${localDay} <= ${bounds.today}::date`))
					// By position: the time zone is a parameter, so the expression can't be repeated.
					.groupBy(sql`1`),
				db
					.select()
					.from(transaction)
					.where(and(inPeriod, sql`${localDay} = ${bounds.today}::date`))
					.orderBy(desc(transaction.occurredAt)),
				db
					.select({
						targetMinor: goal.targetMinor,
						savedMinor: goal.savedMinor,
						targetDate: goal.targetDate,
					})
					.from(goal)
					.where(and(eq(goal.userId, userId), isNull(goal.archivedAt))),
				recurringFor(db, userId, {
					today: bounds.today,
					start: bounds.start,
					end: bounds.end,
				}),
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
		const goalsMinor = goals.reduce(
			(sum, g) =>
				sum +
				(bounds.kind === "cycle"
					? goalCycleNeeded(g, bounds.start, bounds.days)
					: goalMonthlyNeeded(g, bounds.today)),
			0,
		);
		const reservedMinor = reservedSavings({
			incomeMinor,
			method,
			goalsMonthlyMinor: goalsMinor,
			transfersMinor: transfers.reduce((sum, t) => sum + t.amountMinor, 0),
		});
		const spentOn = new Map(byDay.map((d) => [d.day, Number(d.minor)]));
		const dailyMinor = Array.from(
			{ length: daysInclusive(bounds.start, bounds.today) },
			(_, i) => spentOn.get(addDays(bounds.start, i)) ?? 0,
		);

		return {
			homeCurrency,
			method,
			period: {
				kind: bounds.kind,
				start: bounds.start,
				end: bounds.end,
				days: bounds.days,
				cycleId: bounds.cycleId,
				status: bounds.status,
			},
			incomeMinor,
			reservedMinor,
			// Kept when switching plans, but only counted while this plan is on.
			transfers: method === "pay_yourself_first" ? transfers : [],
			daysLeft: bounds.daysLeft,
			monthSpentMinor: spentBeforeTodayMinor + spentTodayMinor,
			dailyMinor,
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
	}

	return {
		forBounds,
		async forUser(userId: string, at?: Date): Promise<Summary> {
			const [p] = await db
				.select({ method: profile.budgetMethod })
				.from(profile)
				.where(eq(profile.userId, userId))
				.limit(1);
			return forBounds(
				userId,
				await periodBounds(db, userId, at),
				p?.method ?? null,
			);
		},
	};
}

export type SummaryService = ReturnType<typeof createSummaryService>;
