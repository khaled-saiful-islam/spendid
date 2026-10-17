/**
 * Month pace: how this month's spending compares with an even pace through the month, where
 * it's heading, and what spending a little less each day would change. All in minor units.
 */

export interface PaceInput {
	/** Money for spending this month: income minus what's kept aside for savings. */
	budgetMinor: number;
	/** Spending per day so far this month (index 0 = the 1st), today included. */
	dailyMinor: number[];
	/** Days in this month. */
	daysInMonth: number;
	/** Bills and subscriptions still expected this month. */
	billsDueMinor: number;
}

export interface Pace {
	/** Spent so far, day by day (running total). */
	actual: number[];
	/** An even pace, day by day, from 0 to the budget. */
	even: number[];
	/** Where the running total is heading at the current pace, from today to month end. */
	forecast: number[];
	spentMinor: number;
	/** Average a day so far, bills not included. */
	perDayMinor: number;
	/** Budget left at month end at this pace (negative = short). */
	landingMinor: number;
	/** Day of the month the money would run out at this pace, or null if it lasts. */
	runsOutOn: number | null;
	/** Ahead of (negative) or behind (positive) the even pace today. */
	vsEvenMinor: number;
}

export function monthPace(input: PaceInput): Pace {
	const today = input.dailyMinor.length;
	const actual: number[] = [];
	let sum = 0;
	for (const d of input.dailyMinor) {
		sum += d;
		actual.push(sum);
	}
	const even = Array.from({ length: input.daysInMonth }, (_, i) =>
		Math.round((input.budgetMinor * (i + 1)) / input.daysInMonth),
	);
	const perDay = today > 0 ? Math.round(sum / today) : 0;
	const remaining = input.daysInMonth - today;
	const forecast = [sum];
	for (let i = 1; i <= remaining; i++)
		forecast.push(
			sum + perDay * i + (i === remaining ? input.billsDueMinor : 0),
		);
	const finalSpend = forecast.at(-1) ?? sum;
	let runsOutOn: number | null = null;
	if (finalSpend > input.budgetMinor) {
		if (sum >= input.budgetMinor) runsOutOn = today;
		else if (perDay > 0)
			runsOutOn = Math.min(
				input.daysInMonth,
				today +
					Math.ceil((input.budgetMinor - sum - input.billsDueMinor) / perDay),
			);
		else runsOutOn = input.daysInMonth;
	}
	return {
		actual,
		even,
		forecast,
		spentMinor: sum,
		perDayMinor: perDay,
		landingMinor: input.budgetMinor - finalSpend,
		runsOutOn,
		vsEvenMinor: sum - (even[today - 1] ?? 0),
	};
}

/** What spending `lessPerDay` less each day for the rest of the month would leave over. */
export function whatIf(
	pace: Pick<Pace, "landingMinor">,
	daysLeftAfterToday: number,
	lessPerDayMinor: number,
): { landingMinor: number; extraMinor: number } {
	const extra = Math.max(0, lessPerDayMinor) * Math.max(0, daysLeftAfterToday);
	return { landingMinor: pace.landingMinor + extra, extraMinor: extra };
}

/**
 * Weeks sooner a goal arrives if `extraPerMonthMinor` more goes into it each month.
 * Null when the goal is done or nothing extra goes in.
 */
export function goalWeeksSooner(
	goal: { targetMinor: number; savedMinor: number; monthlyNeededMinor: number },
	extraPerMonthMinor: number,
): number | null {
	const left = goal.targetMinor - goal.savedMinor;
	if (left <= 0 || extraPerMonthMinor <= 0) return null;
	const base = goal.monthlyNeededMinor > 0 ? goal.monthlyNeededMinor : 0;
	const before = base > 0 ? left / base : null;
	const after = left / (base + extraPerMonthMinor);
	if (before === null) return null;
	return Math.max(0, Math.round(((before - after) * 52) / 12));
}
