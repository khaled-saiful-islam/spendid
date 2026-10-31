import { z } from "zod";
import { BUDGET_METHODS } from "./profile";

/** The budget period: the calendar month, or the person's own cycle (payday to payday). */
export const PERIOD_KINDS = ["month", "cycle"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];
/** A draft is a cycle Spendid made when the last one ended; "Looks right" marks it set. */
export const CYCLE_STATUSES = ["set", "draft"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const CYCLE_MIN_DAYS = 7;
export const CYCLE_MAX_DAYS = 62;

const DAY_MS = 86_400_000;
const at = (day: string) => Date.parse(`${day}T00:00:00Z`);

export function addDays(day: string, n: number): string {
	return new Date(at(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both included (the same day is 1). */
export function daysInclusive(from: string, to: string): number {
	return Math.round((at(to) - at(from)) / DAY_MS) + 1;
}

export interface CycleRange {
	startsOn: string;
	endsOn: string;
}

export type CycleCheck =
	| { ok: true; previousEndsOn: string | null }
	| { ok: false; field: "startsOn" | "endsOn"; message: string };

/**
 * Whether a cycle can be saved as the current one. `previous` is the cycle before it (null: none).
 * Its end follows the new start, so it must stay 7 to 62 days. `joinPrevious` is false for a new
 * run after calendar months: a gap is then fine, an overlap still moves the previous end.
 * `previousEndsOn` is the previous cycle's new end, or null to leave it as it is.
 */
export function checkCycle(input: {
	range: CycleRange;
	today: string;
	previous: CycleRange | null;
	joinPrevious: boolean;
}): CycleCheck {
	const { range, today, previous } = input;
	if (range.endsOn < range.startsOn)
		return {
			ok: false,
			field: "endsOn",
			message: "The end has to be after the start.",
		};
	const days = daysInclusive(range.startsOn, range.endsOn);
	if (days < CYCLE_MIN_DAYS || days > CYCLE_MAX_DAYS)
		return { ok: false, field: "endsOn", message: "A cycle is 7 to 62 days." };
	if (range.startsOn > today || range.endsOn < today)
		return {
			ok: false,
			field: "startsOn",
			message: "Today has to be inside your cycle.",
		};
	if (!previous) return { ok: true, previousEndsOn: null };
	if (range.startsOn <= previous.startsOn)
		return {
			ok: false,
			field: "startsOn",
			message: "This starts before your last cycle began.",
		};
	const touches = range.startsOn <= addDays(previous.endsOn, 1);
	if (!touches && !input.joinPrevious)
		return { ok: true, previousEndsOn: null };
	const previousEndsOn = addDays(range.startsOn, -1);
	const previousDays = daysInclusive(previous.startsOn, previousEndsOn);
	if (previousDays < CYCLE_MIN_DAYS)
		return {
			ok: false,
			field: "startsOn",
			message: "That would make your last cycle shorter than 7 days.",
		};
	if (previousDays > CYCLE_MAX_DAYS)
		return {
			ok: false,
			field: "startsOn",
			message: "That would make your last cycle longer than 62 days.",
		};
	return { ok: true, previousEndsOn };
}

/** The cycle after `last`: it starts the day after, with the same length. */
export function nextCycle(last: CycleRange): CycleRange {
	const startsOn = addDays(last.endsOn, 1);
	return {
		startsOn,
		endsOn: addDays(startsOn, daysInclusive(last.startsOn, last.endsOn) - 1),
	};
}

/** Drafts after `last`, back to back, until one covers `today` (none while `last` does). */
export function draftsUntil(last: CycleRange, today: string): CycleRange[] {
	const drafts: CycleRange[] = [];
	let current = last;
	while (current.endsOn < today) {
		current = nextCycle(current);
		drafts.push(current);
	}
	return drafts;
}

/**
 * A goal's share of one cycle: what's still needed ÷ the cycles (of this length) left from the
 * cycle's start to the goal's date, rounded up. Counted from the start so it holds all cycle.
 */
export function goalCycleNeeded(
	goal: { targetMinor: number; savedMinor: number; targetDate: string | null },
	cycleStart: string,
	cycleDays: number,
): number {
	const remaining = goal.targetMinor - goal.savedMinor;
	if (remaining <= 0 || !goal.targetDate) return 0;
	const days = daysInclusive(cycleStart, goal.targetDate);
	const cycles = Math.max(1, Math.ceil(days / cycleDays));
	return Math.ceil(remaining / cycles);
}

/** The period every plan number covers. */
export const PeriodSchema = z.object({
	kind: z.enum(PERIOD_KINDS),
	start: z.iso.date(),
	/** Last day, included. */
	end: z.iso.date(),
	days: z.number().int(),
	cycleId: z.uuid().nullable(),
	status: z.enum(CYCLE_STATUSES).nullable(),
});
export type Period = z.infer<typeof PeriodSchema>;

const CycleRangeSchema = z.object({
	startsOn: z.iso.date(),
	endsOn: z.iso.date(),
});

/** What the "Your plan" sheet saves. */
export const PlanSetupInputSchema = z
	.object({
		period: z.enum(PERIOD_KINDS),
		cycle: CycleRangeSchema.nullable(),
		incomeMinor: z.number().int().min(0).max(10_000_000_000_000),
		method: z.enum(BUDGET_METHODS).nullable(),
	})
	.superRefine((v, ctx) => {
		if (v.period === "cycle" && !v.cycle)
			ctx.addIssue({
				code: "custom",
				path: ["cycle", "startsOn"],
				message: "Pick the start and end dates.",
			});
	});
export type PlanSetupInput = z.infer<typeof PlanSetupInputSchema>;

export const PlanSetupSchema = z.object({
	period: z.enum(PERIOD_KINDS),
	cycle: CycleRangeSchema.extend({
		id: z.uuid(),
		status: z.enum(CYCLE_STATUSES),
	}).nullable(),
	/** The cycle's salary, or the monthly income. */
	incomeMinor: z.number().nullable(),
	method: z.enum(BUDGET_METHODS).nullable(),
	today: z.iso.date(),
});
export type PlanSetup = z.infer<typeof PlanSetupSchema>;

export const PlanPreviewSchema = z.object({
	status: z.enum(["ok", "over", "no-income"]),
	dailyAllowanceMinor: z.number(),
	days: z.number().int(),
	daysLeft: z.number().int(),
});
export type PlanPreview = z.infer<typeof PlanPreviewSchema>;
