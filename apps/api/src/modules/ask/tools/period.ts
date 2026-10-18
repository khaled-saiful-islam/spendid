/** Periods people name, worked out here so the model never does date arithmetic. */
export const PERIODS = [
	"today",
	"yesterday",
	"this_week",
	"last_week",
	"this_month",
	"last_month",
	"this_year",
	"last_year",
	"last_7_days",
	"last_30_days",
] as const;
export type Period = (typeof PERIODS)[number];

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

/** First and last day (inclusive, YYYY-MM-DD) of `period`, seen from `today`. */
export function periodRange(
	period: Period,
	today: string,
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
