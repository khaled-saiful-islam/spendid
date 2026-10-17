import { dateLocale } from "@/i18n";

/**
 * Dates and times show in the app's time zone (the person's profile), never the device's:
 * the same on every device, and the same days the server counts by. Set when the profile
 * loads; until then the device's zone stands in.
 */
const FALLBACK = "Asia/Kuala_Lumpur";

function isZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat("en", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

let zone = (() => {
	try {
		const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return device && isZone(device) ? device : FALLBACK;
	} catch {
		return FALLBACK;
	}
})();

export function setAppTimeZone(tz: string | null | undefined): void {
	if (tz && isZone(tz)) zone = tz;
}

export const appTimeZone = (): string => zone;

/** "10:02 pm" for a moment. */
export function formatTime(at: string | Date): string {
	return new Date(at).toLocaleTimeString(dateLocale(), {
		hour: "numeric",
		minute: "2-digit",
		timeZone: zone,
	});
}

/** A moment's date and/or time, with the given parts, in the app's zone. */
export function formatMoment(
	at: string | Date,
	opts: Intl.DateTimeFormatOptions,
): string {
	return new Date(at).toLocaleString(dateLocale(), { ...opts, timeZone: zone });
}

/** A calendar day ("YYYY-MM-DD", no time of its own) shown as exactly that day. */
export function formatDay(
	day: string,
	opts: Intl.DateTimeFormatOptions,
): string {
	return new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString(
		dateLocale(),
		{
			...opts,
			timeZone: "UTC",
		},
	);
}

const dayFormat = () =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone: zone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});

/** The day ("YYYY-MM-DD") a moment falls on in the app's zone. */
export function appDayOf(at: string | Date): string {
	return dayFormat().format(new Date(at));
}

/** Today in the app's zone. */
export function appToday(at: Date = new Date()): string {
	return appDayOf(at);
}

/** The hour (0-23) in the app's zone: greetings and Pip's bedtime. */
export function appHour(at: Date = new Date()): number {
	const hour = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		hour: "numeric",
		hourCycle: "h23",
	}).format(at);
	return Number(hour) % 24;
}

/** A calendar day moved by n days. */
export function addDays(day: string, n: number): string {
	return new Date(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) + n * 86_400_000)
		.toISOString()
		.slice(0, 10);
}

/** The moment it's `hour`:00 on `day` in the app's zone. */
export function atHourOn(day: string, hour: number): Date {
	const [y, m, d] = day.slice(0, 10).split("-").map(Number) as [
		number,
		number,
		number,
	];
	const guess = Date.UTC(y, m - 1, d, hour);
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		})
			.formatToParts(new Date(guess))
			.map((p) => [p.type, Number(p.value)]),
	) as Record<string, number>;
	const wall = Date.UTC(
		parts.year ?? y,
		(parts.month ?? m) - 1,
		parts.day ?? d,
		(parts.hour ?? hour) % 24,
		parts.minute ?? 0,
	);
	return new Date(guess - (wall - guess));
}

/**
 * When an expense on `day` happened: right now if it's today, otherwise noon that day
 * (in the app's zone), since no time was given.
 */
export function momentOnDay(day: string, now: Date = new Date()): string {
	return day.slice(0, 10) === appToday(now)
		? now.toISOString()
		: atHourOn(day, 12).toISOString();
}
