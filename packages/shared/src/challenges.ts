import { z } from "zod";

/**
 * Challenges are checked from the person's own spending, so there's nothing to tick off.
 * Bills, subscriptions and rent never count against a challenge: they're not choices that week.
 */
export const CHALLENGE_KINDS = [
	"no-spend-weekend",
	"cook-at-home",
	"eat-out-cap",
	"shopping-pause",
	"daily-cap",
	"log-daily",
] as const;
export type ChallengeKind = (typeof CHALLENGE_KINDS)[number];

export const FIXED_COST_SLUGS = [
	"bills",
	"phone",
	"subscriptions",
	"home",
	"insurance",
	"loans",
	"taxes",
	"savings",
] as const;

export const CHALLENGES: Record<
	ChallengeKind,
	{ title: string; body: string; days: number; emoji: string }
> = {
	"no-spend-weekend": {
		title: "No-spend weekend",
		body: "Spend nothing on Saturday and Sunday. Bills don't count.",
		days: 2,
		emoji: "🌴",
	},
	"cook-at-home": {
		title: "Cook-at-home week",
		body: "Eat out at most twice in 7 days.",
		days: 7,
		emoji: "🍳",
	},
	"eat-out-cap": {
		title: "Eating-out cap",
		body: "Keep eating out under your target for 7 days.",
		days: 7,
		emoji: "🥢",
	},
	"shopping-pause": {
		title: "Shopping pause",
		body: "No shopping for 7 days. Groceries are fine.",
		days: 7,
		emoji: "🛍️",
	},
	"daily-cap": {
		title: "Under the line",
		body: "Stay under your daily target every day for 7 days. Bills don't count.",
		days: 7,
		emoji: "📉",
	},
	"log-daily": {
		title: "Log every day",
		body: "Log something every day for 7 days.",
		days: 7,
		emoji: "📝",
	},
};

export const StartChallengeSchema = z.object({
	kind: z.enum(CHALLENGE_KINDS),
	/** For caps: the limit in minor units (eat-out total, or per day). */
	targetMinor: z.number().int().positive().max(100_000_000).optional(),
});
export type StartChallenge = z.infer<typeof StartChallengeSchema>;

export type DayState = "pass" | "fail" | "pending";

export interface ChallengeDay {
	day: string;
	/** Spending that counts for this challenge (fixed costs left out). */
	minor: number;
	/** Expenses that count, by category slug. */
	bySlug: Record<string, { minor: number; count: number }>;
	/** Anything logged or a check-in that day. */
	active: boolean;
}

export interface ChallengeResult {
	days: { day: string; state: DayState }[];
	status: "active" | "won" | "lost";
	/** For caps: how much of the target is used so far. */
	usedMinor: number | null;
}

/** Judges a challenge from its days so far. `days` covers start..min(today, end), in order. */
export function judgeChallenge(input: {
	kind: ChallengeKind;
	targetMinor: number | null;
	start: string;
	end: string;
	today: string;
	days: ChallengeDay[];
}): ChallengeResult {
	const { kind, targetMinor } = input;
	const all = datesBetween(input.start, input.end);
	const seen = new Map(input.days.map((d) => [d.day, d]));
	let eatOutCount = 0;
	let eatOutMinor = 0;
	let lost = false;
	const days = all.map((day): { day: string; state: DayState } => {
		const d = seen.get(day);
		if (day > input.today || lost) return { day, state: "pending" };
		const finished = day < input.today;
		const food = d?.bySlug.food ?? { minor: 0, count: 0 };
		eatOutCount += food.count;
		eatOutMinor += food.minor;
		let ok: boolean;
		switch (kind) {
			case "no-spend-weekend":
				ok = (d?.minor ?? 0) === 0;
				break;
			case "cook-at-home":
				ok = eatOutCount <= 2;
				break;
			case "eat-out-cap":
				ok = eatOutMinor <= (targetMinor ?? 0);
				break;
			case "shopping-pause":
				ok = (d?.bySlug.shopping?.minor ?? 0) === 0;
				break;
			case "daily-cap":
				ok = (d?.minor ?? 0) <= (targetMinor ?? 0);
				break;
			case "log-daily":
				ok = d?.active ?? false;
				break;
		}
		if (!ok && (finished || kind !== "log-daily")) lost = true;
		// Today can still be completed for "log every day"; other rules fail as soon as they break.
		return {
			day,
			state: ok
				? "pass"
				: finished || kind !== "log-daily"
					? "fail"
					: "pending",
		};
	});
	// Spending rules are only won once the last day is over; a logged day can't be undone.
	const done =
		input.today > input.end ||
		(kind === "log-daily" &&
			input.today === input.end &&
			days.every((d) => d.state === "pass"));
	return {
		days,
		status: lost
			? "lost"
			: done && days.every((d) => d.state === "pass")
				? "won"
				: "active",
		usedMinor: kind === "eat-out-cap" ? eatOutMinor : null,
	};
}

export function datesBetween(start: string, end: string): string[] {
	const out: string[] = [];
	for (
		let t = Date.parse(`${start}T00:00:00Z`);
		t <= Date.parse(`${end}T00:00:00Z`) && out.length < 31;
		t += 86_400_000
	)
		out.push(new Date(t).toISOString().slice(0, 10));
	return out;
}

/** When a new challenge runs: weekends start on the coming Saturday (or this one), others today. */
export function challengeWindow(
	kind: ChallengeKind,
	today: string,
): { start: string; end: string } {
	const t = Date.parse(`${today}T00:00:00Z`);
	const add = (days: number) =>
		new Date(t + days * 86_400_000).toISOString().slice(0, 10);
	if (kind === "no-spend-weekend") {
		const dow = new Date(t).getUTCDay(); // 0 Sun … 6 Sat
		if (dow === 0) return { start: today, end: today };
		const toSat = (6 - dow + 7) % 7;
		return { start: add(toSat), end: add(toSat + 1) };
	}
	return { start: today, end: add(CHALLENGES[kind].days - 1) };
}

export interface ChallengeView {
	id: string;
	kind: ChallengeKind;
	targetMinor: number | null;
	currency: string;
	start: string;
	end: string;
	result: ChallengeResult;
	/** Set when the person stopped it themselves. */
	gaveUp: boolean;
}

export interface ChallengeBoard {
	today: string;
	active: ChallengeView[];
	won: ChallengeView[];
	/** Suggested caps from recent spending, for the start sheet. */
	suggested: { eatOutWeekMinor: number; dailyMinor: number };
}
