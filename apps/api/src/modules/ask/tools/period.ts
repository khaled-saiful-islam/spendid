/** Periods people name, worked out here so the model never does date arithmetic. */
export const PERIODS = [
	"today",
	"yesterday",
	"this_week",
	"last_week",
	"this_month",
	"last_month",
	"this_cycle",
	"last_cycle",
	"this_year",
	"last_year",
	"last_7_days",
	"last_30_days",
] as const;
export type Period = (typeof PERIODS)[number];

/** The person's cycles as day spans (inclusive); null when they budget by calendar month. */
export interface CycleSpans {
	current: { from: string; to: string } | null;
	previous: { from: string; to: string } | null;
}

const DAY_MS = 86_400_000;

function parse(day: string): Date {
	return new Date(`${day}T00:00:00Z`);
}

function format(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
	return format(new Date(parse(day).getTime() + n * DAY_MS));
}

/** Monday of the week `day` is in (weeks run Monday to Sunday). */
function mondayOf(day: string): string {
	const weekday = (parse(day).getUTCDay() + 6) % 7;
	return addDays(day, -weekday);
}

/**
 * First and last day (inclusive, YYYY-MM-DD) of `period`, seen from `today`. Without a cycle,
 * this_cycle and last_cycle are this and last calendar month.
 */
export function periodRange(
	period: Period,
	today: string,
	cycles?: CycleSpans | null,
): { from: string; to: string } {
	const [y, m] = today.split("-").map(Number) as [number, number];
	switch (period) {
		case "today":
			return { from: today, to: today };
		case "yesterday": {
			const d = addDays(today, -1);
			return { from: d, to: d };
		}
		case "this_week":
			return { from: mondayOf(today), to: today };
		case "last_week": {
			const monday = addDays(mondayOf(today), -7);
			return { from: monday, to: addDays(monday, 6) };
		}
		case "this_month":
			return { from: format(new Date(Date.UTC(y, m - 1, 1))), to: today };
		case "last_month":
			return {
				from: format(new Date(Date.UTC(y, m - 2, 1))),
				to: format(new Date(Date.UTC(y, m - 1, 0))),
			};
		case "this_cycle":
			return cycles?.current
				? { from: cycles.current.from, to: today }
				: periodRange("this_month", today);
		case "last_cycle":
			return cycles?.previous ?? periodRange("last_month", today);
		case "this_year":
			return { from: `${y}-01-01`, to: today };
		case "last_year":
			return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
		case "last_7_days":
			return { from: addDays(today, -6), to: today };
		case "last_30_days":
			return { from: addDays(today, -29), to: today };
	}
}

/**
 * When "this cycle" or "last cycle" had to fall back to a calendar month, the words that say
 * so (null when it really is a cycle). The answer must tell the person.
 */
export function cycleFallbackNote(
	period: Period | undefined,
	cycles: CycleSpans | null | undefined,
): string | null {
	if (period === "this_cycle" && !cycles?.current)
		return "They budget by calendar month and have no cycle, so these days are this calendar month. Say so.";
	if (period === "last_cycle" && !cycles?.previous)
		return cycles?.current
			? "No earlier cycle: before this cycle they used calendar months, so these days are last calendar month. Say so."
			: "They budget by calendar month and have no cycle, so these days are last calendar month. Say so.";
	return null;
}
