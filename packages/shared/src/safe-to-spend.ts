import type { BudgetMethod } from "./profile";

export interface SafeToSpendInput {
	incomeMinor: number | null;
	/** Money set aside first (savings goals, the 20% of 50/30/20). */
	reservedMinor: number;
	/** Bills and subscriptions still expected later this month. */
	billsDueMinor?: number;
	/** Spent this month before today, home currency. */
	spentBeforeTodayMinor: number;
	spentTodayMinor: number;
	/** Days left in the month including today (≥ 1). */
	daysLeft: number;
}

export interface SafeToSpend {
	status: "ok" | "over" | "no-income";
	/** Today's share of what's left, fixed at the start of the day. */
	dailyAllowanceMinor: number;
	/** Allowance minus today's spending; negative when over. */
	safeTodayMinor: number;
	leftThisMonthMinor: number;
}

/**
 * The one number on the home screen:
 *   (income − reserved − bills still due − spent before today) ÷ days left, minus today's spending.
 * Spending today lowers today's number; it only spreads across future days from tomorrow.
 */
export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpend {
	if (input.incomeMinor === null) {
		return {
			status: "no-income",
			dailyAllowanceMinor: 0,
			safeTodayMinor: 0,
			leftThisMonthMinor: 0,
		};
	}
	const available =
		input.incomeMinor -
		input.reservedMinor -
		(input.billsDueMinor ?? 0) -
		input.spentBeforeTodayMinor;
	const dailyAllowanceMinor = Math.max(
		0,
		Math.floor(available / Math.max(1, input.daysLeft)),
	);
	const safeTodayMinor = dailyAllowanceMinor - input.spentTodayMinor;
	return {
		status: safeTodayMinor < 0 ? "over" : "ok",
		dailyAllowanceMinor,
		safeTodayMinor,
		leftThisMonthMinor: available - input.spentTodayMinor,
	};
}

/** 50/30/20 keeps at least 20% of income aside; every style keeps what goals need. */
export function reservedSavings(input: {
	incomeMinor: number | null;
	method: BudgetMethod;
	goalsMonthlyMinor: number;
}): number {
	const styleShare =
		input.method === "fifty_thirty_twenty" && input.incomeMinor !== null
			? Math.round(input.incomeMinor * 0.2)
			: 0;
	return Math.max(styleShare, input.goalsMonthlyMinor);
}

/** Whole calendar months from `today` to `targetDate`, counting the current month (min 1). */
function monthsUntil(today: string, targetDate: string): number {
	const [ty, tm] = today.split("-").map(Number) as [number, number];
	const [gy, gm] = targetDate.split("-").map(Number) as [number, number];
	return Math.max(1, (gy - ty) * 12 + (gm - tm));
}

/** How much a goal needs each month to land on its date. Open-ended goals need nothing. */
export function goalMonthlyNeeded(
	goal: { targetMinor: number; savedMinor: number; targetDate: string | null },
	today: string,
): number {
	const remaining = goal.targetMinor - goal.savedMinor;
	if (remaining <= 0 || !goal.targetDate) return 0;
	return Math.ceil(remaining / monthsUntil(today, goal.targetDate));
}
