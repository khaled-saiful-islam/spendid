import { z } from "zod";

const DAY_MS = 86_400_000;
const prevDay = (day: string) =>
	new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
const nextDay = (day: string) =>
	new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** One streak shield is earned for every 7 days in a row; at most this many are kept. */
export const MAX_SHIELDS = 2;
export const DAYS_PER_SHIELD = 7;

/**
 * Streak = days in a row with something logged or a check-in. Today not done yet doesn't
 * break it (the day isn't over). Every 7 days in a row earns a shield (keep up to 2); a
 * missed day uses one instead of ending the streak, like a friend covering for you.
 */
export function computeStreak(
	activeDays: Iterable<string>,
	today: string,
): {
	current: number;
	best: number;
	doneToday: boolean;
	shields: number;
	/** Missed days a shield covered in the current streak. */
	shieldedDays: string[];
	/** Every day with activity ever (it only grows): Pip's level. */
	loggedDays: number;
} {
	const days = new Set([...activeDays].filter((d) => d <= today));
	const doneToday = days.has(today);
	const sorted = [...days].sort();
	const end = doneToday ? today : prevDay(today);
	let run = 0;
	let best = 0;
	let shields = 0;
	let sinceShield = 0;
	let shieldedDays: string[] = [];
	for (
		let d = sorted[0] ?? end;
		sorted.length > 0 && d <= end;
		d = nextDay(d)
	) {
		if (days.has(d)) {
			run += 1;
			sinceShield += 1;
			if (sinceShield === DAYS_PER_SHIELD) {
				shields = Math.min(MAX_SHIELDS, shields + 1);
				sinceShield = 0;
			}
		} else if (run > 0 && shields > 0) {
			shields -= 1;
			shieldedDays = [...shieldedDays, d];
		} else {
			run = 0;
			sinceShield = 0;
			shields = 0;
			shieldedDays = [];
		}
		best = Math.max(best, run);
	}
	return {
		current: run,
		best,
		doneToday,
		shields,
		shieldedDays,
		loggedDays: days.size,
	};
}

/** Pip grows with every day logged (it never shrinks), and each level brings a gift to wear. */
export const PIP_LEVELS = [
	{ days: 0, title: "Little Pip", gift: null },
	{ days: 3, title: "Curious Pip", gift: "leaf" },
	{ days: 7, title: "Snug Pip", gift: "scarf" },
	{ days: 14, title: "Explorer Pip", gift: "explorer" },
	{ days: 30, title: "Cool Pip", gift: "shades" },
	{ days: 60, title: "Royal Pip", gift: "crown" },
	{ days: 100, title: "Legendary Pip", gift: "medal" },
] as const;
export type PipGift = Exclude<(typeof PIP_LEVELS)[number]["gift"], null>;

export function pipLevel(loggedDays: number): {
	level: number;
	title: string;
	gifts: PipGift[];
	next: { days: number; title: string; gift: PipGift } | null;
} {
	let level = 0;
	for (const [i, l] of PIP_LEVELS.entries())
		if (loggedDays >= l.days) level = i;
	const gifts = PIP_LEVELS.slice(1, level + 1).map((l) => l.gift as PipGift);
	const n = PIP_LEVELS[level + 1];
	return {
		level: level + 1,
		title: PIP_LEVELS[level]?.title ?? "Little Pip",
		gifts,
		next: n ? { days: n.days, title: n.title, gift: n.gift as PipGift } : null,
	};
}

/** Festive looks Pip wears by itself around Malaysian celebrations (a week either side). */
const FESTIVALS: { look: PipFestive; days: string[] }[] = [
	{ look: "ketupat", days: ["2026-03-20", "2027-03-10", "2028-02-27"] },
	{ look: "lantern", days: ["2026-02-17", "2027-02-06", "2028-01-26"] },
	{ look: "lamp", days: ["2026-11-08", "2027-10-28", "2028-10-17"] },
	{
		look: "flag",
		days: [
			"2026-08-31",
			"2026-09-16",
			"2027-08-31",
			"2027-09-16",
			"2028-08-31",
			"2028-09-16",
		],
	},
	{ look: "santa", days: ["2026-12-25", "2027-12-25", "2028-12-25"] },
];
export type PipFestive = "ketupat" | "lantern" | "lamp" | "flag" | "santa";

export function festiveLook(today: string): PipFestive | null {
	const at = Date.parse(`${today}T00:00:00Z`);
	for (const f of FESTIVALS)
		if (
			f.days.some(
				(d) => Math.abs(Date.parse(`${d}T00:00:00Z`) - at) <= 7 * DAY_MS,
			)
		)
			return f.look;
	return null;
}

/** Streak lengths worth a little celebration. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365] as const;

export interface Streak {
	current: number;
	best: number;
	doneToday: boolean;
	shields: number;
	shieldedDays: string[];
	loggedDays: number;
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
