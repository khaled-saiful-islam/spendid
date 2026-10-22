/** AI allowances run calendar months in Malaysia time: they renew at midnight on the 1st. */
export const ALLOWANCE_TIME_ZONE = "Asia/Kuala_Lumpur";

/** How far `timeZone` is ahead of UTC at `at`, in milliseconds. */
function offsetMs(at: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(at);
	const part = (type: string) =>
		Number(parts.find((p) => p.type === type)?.value ?? 0);
	return (
		Date.UTC(
			part("year"),
			part("month") - 1,
			part("day"),
			part("hour"),
			part("minute"),
			part("second"),
		) -
		at.getTime() +
		at.getUTCMilliseconds()
	);
}

/**
 * The allowance month `now` falls in: its key ("202610"), the moment it began, and the day
 * the next one begins (when the allowance renews).
 */
export function allowanceMonth(now: Date = new Date()): {
	key: string;
	start: Date;
	resetsOn: string;
} {
	const [y, m] = new Intl.DateTimeFormat("en-CA", {
		timeZone: ALLOWANCE_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
	})
		.format(now)
		.split("-")
		.map(Number) as [number, number];
	const midnight = Date.UTC(y, m - 1, 1);
	return {
		key: `${y}${String(m).padStart(2, "0")}`,
		start: new Date(
			midnight - offsetMs(new Date(midnight), ALLOWANCE_TIME_ZONE),
		),
		resetsOn: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
	};
}
