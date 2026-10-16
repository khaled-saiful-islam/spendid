import { z } from "zod";

const DAY_MS = 86_400_000;
const prevDay = (day: string) =>
	new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
const nextDay = (day: string) =>
	new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * Streak = days in a row with something logged or a check-in. Today not done yet doesn't
 * break it (the day isn't over), so the count runs back from today or yesterday.
 */
export function computeStreak(
	activeDays: Iterable<string>,
	today: string,
): { current: number; best: number; doneToday: boolean } {
	const days = new Set(activeDays);
	const doneToday = days.has(today);
	let current = 0;
	for (let d = doneToday ? today : prevDay(today); days.has(d); d = prevDay(d))
		current += 1;
	let best = 0;
	for (const d of days) {
		if (days.has(prevDay(d))) continue; // only count from the start of each run
		let run = 0;
		for (let x = d; days.has(x); x = nextDay(x)) run += 1;
		best = Math.max(best, run);
	}
	return { current, best: Math.max(best, current), doneToday };
}

/** Streak lengths worth a little celebration. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365] as const;

export interface Streak {
	current: number;
	best: number;
	doneToday: boolean;
	/** Evening and today isn't checked in yet: show "Anything I missed today?". */
	checkInDue: boolean;
	checkedInToday: boolean;
}

export const CheckInSchema = z.object({
	kind: z.enum(["all-logged", "nothing"]),
});

/** Impulse pause: wait this long before deciding. */
export const WISH_COOLDOWN_HOURS = 48;
/** A working month, for "hours of work" (40 h × 52 weeks ÷ 12). */
export const WORK_HOURS_PER_MONTH = (40 * 52) / 12;

/** How many hours of work something costs, from monthly income. Null without income. */
export function hoursOfWork(
	priceMinor: number,
	monthlyIncomeMinor: number | null,
): number | null {
	if (!monthlyIncomeMinor || monthlyIncomeMinor <= 0) return null;
	return (
		Math.round(
			(priceMinor / (monthlyIncomeMinor / WORK_HOURS_PER_MONTH)) * 10,
		) / 10
	);
}

export const WishInputSchema = z.object({
	name: z.string().trim().min(1, "What do you want to buy?").max(80),
	priceMinor: z.number().int().positive("Add the price").max(1_000_000_000),
	currency: z.string().length(3),
	link: z.url("That link doesn't look right").max(500).nullable().optional(),
});
export type WishInput = z.infer<typeof WishInputSchema>;

export const WishDecisionSchema = z.object({
	decision: z.enum(["bought", "skipped"]),
});

export interface Wish {
	id: string;
	name: string;
	priceMinor: number;
	currency: string;
	link: string | null;
	createdAt: string;
	coolUntil: string;
	decision: "bought" | "skipped" | null;
	decidedAt: string | null;
	hoursOfWork: number | null;
}

export interface WishList {
	waiting: Wish[];
	decided: Wish[];
	/** Skipped wishes in the home currency: money not spent thanks to waiting. */
	savedMinor: number;
	currency: string;
}
