import { z } from "zod";

export const BILLING_CYCLES = [
	"weekly",
	"monthly",
	"quarterly",
	"yearly",
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

const DateString = z.iso.date("Pick a date");

export const SubscriptionInputSchema = z.object({
	name: z.string().trim().min(1, "Name it").max(60),
	brand: z.string().max(20).nullable().optional(),
	amountMinor: z.number().int().positive("Add the amount").max(100_000_000),
	currency: z.string().length(3),
	amountVaries: z.boolean().default(false),
	cycle: z.enum(BILLING_CYCLES).default("monthly"),
	nextDue: DateString,
	remindDays: z.number().int().min(0).max(14).default(3),
	categoryId: z.uuid(),
	note: z.string().trim().max(200).nullable().optional(),
});
export type SubscriptionInput = z.input<typeof SubscriptionInputSchema>;

export const MarkPaidSchema = z.object({
	/** What was actually paid; defaults to the usual amount. */
	amountMinor: z.number().int().positive().max(100_000_000).optional(),
});

export interface Subscription {
	id: string;
	name: string;
	brand: string | null;
	amountMinor: number;
	currency: string;
	amountVaries: boolean;
	cycle: BillingCycle;
	nextDue: string;
	dueDay: number;
	remindDays: number;
	categoryId: string;
	note: string | null;
	lastPaidOn: string | null;
	cancelledAt: string | null;
}

export interface SubscriptionOverview {
	currency: string;
	today: string;
	active: Subscription[];
	cancelled: Subscription[];
	/** Every payment due this calendar month (weekly ones appear several times). */
	thisMonth: {
		subscriptionId: string;
		day: string;
		amountMinor: number;
		paid: boolean;
	}[];
	thisMonthMinor: number;
	stillDueMinor: number;
	yearlyMinor: number;
	/** Repeating payments Spendid noticed in spending that aren't added yet. */
	suggestions: {
		merchant: string;
		amountMinor: number;
		cadence: string;
		lastDay: string;
	}[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (y: number, m0: number) =>
	new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** The due date after `day`, keeping the person's day of the month (31st stays 31st). */
export function nextDueAfter(
	day: string,
	cycle: BillingCycle,
	dueDay: number,
): string {
	const [y, m, d] = day.split("-").map(Number) as [number, number, number];
	if (cycle === "weekly") {
		const t = new Date(Date.UTC(y, m - 1, d + 7));
		return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
	}
	const months = cycle === "monthly" ? 1 : cycle === "quarterly" ? 3 : 12;
	const target = new Date(Date.UTC(y, m - 1 + months, 1));
	const ty = target.getUTCFullYear();
	const tm = target.getUTCMonth();
	return `${ty}-${pad(tm + 1)}-${pad(Math.min(dueDay, lastDayOf(ty, tm)))}`;
}

/** Roughly what it costs a month, to compare a weekly gym with a yearly insurance. */
export function monthlyEquivalent(
	amountMinor: number,
	cycle: BillingCycle,
): number {
	if (cycle === "weekly") return Math.round((amountMinor * 52) / 12);
	if (cycle === "quarterly") return Math.round(amountMinor / 3);
	if (cycle === "yearly") return Math.round(amountMinor / 12);
	return amountMinor;
}

export const yearlyCost = (amountMinor: number, cycle: BillingCycle): number =>
	monthlyEquivalent(amountMinor, cycle) * 12;

/** Whole days from `today` to `day` (negative when overdue). Both YYYY-MM-DD. */
export function daysUntil(day: string, today: string): number {
	return Math.round(
		(Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
			86_400_000,
	);
}

/** Due dates from `nextDue` up to `until` (inclusive), at most 6. */
export function dueDatesUntil(
	sub: Pick<Subscription, "nextDue" | "cycle" | "dueDay">,
	until: string,
): string[] {
	const out: string[] = [];
	let day = sub.nextDue;
	while (day <= until && out.length < 6) {
		out.push(day);
		day = nextDueAfter(day, sub.cycle, sub.dueDay);
	}
	return out;
}
