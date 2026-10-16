/**
 * Finds subscriptions and bills in someone's spending: the same shop charging on a steady
 * rhythm (weekly, monthly, yearly). Pure, so the API, worker and tests share it.
 */

export type Cadence = "weekly" | "monthly" | "yearly";

export interface Charge {
	merchant: string;
	merchantKey: string;
	amountMinor: number;
	/** ISO date (YYYY-MM-DD) in the person's time zone. */
	day: string;
	categoryId: string;
	/** In a bills or subscriptions category: two equal charges are enough to count. */
	billLike?: boolean;
}

export interface Recurring {
	merchant: string;
	merchantKey: string;
	cadence: Cadence;
	amountMinor: number;
	/** Set when the latest charge differs from the one before by 3% or more. */
	previousAmountMinor: number | null;
	lastDay: string;
	nextDay: string;
	count: number;
	categoryId: string;
	/** What it costs per month on average. */
	monthlyMinor: number;
}

const BANDS: Record<Cadence, [number, number]> = {
	weekly: [6, 8],
	monthly: [26, 34],
	yearly: [350, 380],
};
/** After this many days past the expected date, a charge is treated as cancelled. */
const GRACE: Record<Cadence, number> = { weekly: 4, monthly: 10, yearly: 30 };

const DAY_MS = 86_400_000;
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Same day next month (clamped to month end), next week or next year. */
export function addCadence(day: string, cadence: Cadence, times = 1): string {
	const [y, m, d] = day.split("-").map(Number) as [number, number, number];
	if (cadence === "weekly") return toDay(toMs(day) + 7 * times * DAY_MS);
	const months = cadence === "monthly" ? times : 12 * times;
	const target = new Date(Date.UTC(y, m - 1 + months, 1));
	const last = new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
	).getUTCDate();
	return toDay(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last)),
	);
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? (sorted[mid] ?? 0)
		: ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const within = (a: number, b: number, pct: number) =>
	Math.abs(a - b) <= Math.abs(b) * pct;

function cadenceOf(gaps: number[]): Cadence | null {
	for (const cadence of ["weekly", "monthly", "yearly"] as const) {
		const [lo, hi] = BANDS[cadence];
		if (gaps.every((g) => g >= lo && g <= hi)) return cadence;
	}
	return null;
}

function detectOne(charges: Charge[], today: string): Recurring | null {
	const sorted = [...charges].sort((a, b) => a.day.localeCompare(b.day));
	// One charge per day at most: a shop charging twice in a day is not a rhythm.
	const daily = sorted.filter(
		(c, i) => i === 0 || c.day !== sorted[i - 1]?.day,
	);
	if (daily.length < 2) return null;
	const recent = daily.slice(-6);
	const gaps = recent
		.slice(1)
		.map((c, i) => (toMs(c.day) - toMs(recent[i]?.day ?? c.day)) / DAY_MS);
	const cadence = cadenceOf(gaps);
	if (!cadence) return null;

	const last = recent.at(-1) as Charge;
	const before = recent.slice(0, -1);
	const typical = median(before.map((c) => c.amountMinor));
	// Earlier charges must be steady; the latest may have changed price.
	if (!before.every((c) => within(c.amountMinor, typical, 0.1))) return null;
	// Two charges only count for bills and subscriptions, and only at (almost) the same amount.
	if (
		recent.length === 2 &&
		(!last.billLike || !within(last.amountMinor, typical, 0.02))
	)
		return null;
	if (recent.length > 2 && !within(last.amountMinor, typical, 0.5)) return null;

	const nextDay = addCadence(last.day, cadence);
	if (toMs(today) > toMs(nextDay) + GRACE[cadence] * DAY_MS) return null;
	const changed = !within(
		last.amountMinor,
		before.at(-1)?.amountMinor ?? last.amountMinor,
		0.03,
	);
	const perMonth =
		cadence === "weekly"
			? (last.amountMinor * 52) / 12
			: cadence === "yearly"
				? last.amountMinor / 12
				: last.amountMinor;
	return {
		merchant: last.merchant,
		merchantKey: last.merchantKey,
		cadence,
		amountMinor: last.amountMinor,
		previousAmountMinor: changed ? (before.at(-1)?.amountMinor ?? null) : null,
		lastDay: last.day,
		nextDay,
		count: daily.length,
		categoryId: last.categoryId,
		monthlyMinor: Math.round(perMonth),
	};
}

/** Every active recurring charge, biggest monthly cost first. */
export function detectRecurring(charges: Charge[], today: string): Recurring[] {
	const groups = new Map<string, Charge[]>();
	for (const c of charges) {
		if (!c.merchantKey) continue;
		groups.set(c.merchantKey, [...(groups.get(c.merchantKey) ?? []), c]);
	}
	return [...groups.values()]
		.map((g) => detectOne(g, today))
		.filter((r): r is Recurring => r !== null)
		.sort((a, b) => b.monthlyMinor - a.monthlyMinor);
}

/**
 * Bills still expected this month: every upcoming (or late, not yet seen) occurrence from
 * the start of the month up to `monthEnd`. A bill already charged this month has moved its
 * next date into a later month, so it isn't counted twice.
 */
export function billsStillDue(
	recurring: Recurring[],
	today: string,
	monthEnd: string,
): {
	minor: number;
	items: { merchant: string; day: string; amountMinor: number }[];
} {
	const monthStart = `${today.slice(0, 7)}-01`;
	const items: { merchant: string; day: string; amountMinor: number }[] = [];
	for (const r of recurring) {
		for (let n = 1; n <= 6; n++) {
			const day = addCadence(r.lastDay, r.cadence, n);
			if (day > monthEnd) break;
			if (day >= monthStart)
				items.push({ merchant: r.merchant, day, amountMinor: r.amountMinor });
		}
	}
	items.sort((a, b) => a.day.localeCompare(b.day));
	return { minor: items.reduce((s, i) => s + i.amountMinor, 0), items };
}
