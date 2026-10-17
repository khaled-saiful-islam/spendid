import { z } from "zod";

export const BILLING_CYCLES = [
	"weekly",
	"monthly",
	"quarterly",
	"yearly",
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/**
 * Services people in Malaysia commonly pay for. Colour and initials only (no logos), so a
 * subscription is recognisable at a glance. `slug` is the category it's filed under.
 */
export const SUBSCRIPTION_BRANDS = [
	{
		key: "netflix",
		name: "Netflix",
		color: "#E50914",
		initials: "N",
		slug: "subscriptions",
	},
	{
		key: "spotify",
		name: "Spotify",
		color: "#1DB954",
		initials: "S",
		slug: "subscriptions",
	},
	{
		key: "youtube",
		name: "YouTube Premium",
		color: "#FF0033",
		initials: "YT",
		slug: "subscriptions",
	},
	{
		key: "disney",
		name: "Disney+ Hotstar",
		color: "#0E2A6B",
		initials: "D+",
		slug: "subscriptions",
	},
	{
		key: "icloud",
		name: "iCloud+",
		color: "#3693F3",
		initials: "iC",
		slug: "subscriptions",
	},
	{
		key: "googleone",
		name: "Google One",
		color: "#4285F4",
		initials: "G1",
		slug: "subscriptions",
	},
	{
		key: "chatgpt",
		name: "ChatGPT Plus",
		color: "#10A37F",
		initials: "AI",
		slug: "subscriptions",
	},
	{
		key: "canva",
		name: "Canva Pro",
		color: "#00C4CC",
		initials: "C",
		slug: "subscriptions",
	},
	{
		key: "astro",
		name: "Astro",
		color: "#E4007C",
		initials: "A",
		slug: "subscriptions",
	},
	{
		key: "unifi",
		name: "Unifi",
		color: "#F26B21",
		initials: "U",
		slug: "bills",
	},
	{
		key: "maxis",
		name: "Maxis",
		color: "#3BB54A",
		initials: "M",
		slug: "bills",
	},
	{
		key: "celcomdigi",
		name: "CelcomDigi",
		color: "#1F4BB8",
		initials: "CD",
		slug: "bills",
	},
	{
		key: "umobile",
		name: "U Mobile",
		color: "#F7941D",
		initials: "UM",
		slug: "bills",
	},
	{
		key: "tnb",
		name: "TNB electricity",
		color: "#D71920",
		initials: "TNB",
		slug: "bills",
	},
	{
		key: "water",
		name: "Water bill",
		color: "#0072BC",
		initials: "Air",
		slug: "bills",
	},
	{
		key: "gym",
		name: "Gym",
		color: "#6D28D9",
		initials: "Gym",
		slug: "health",
	},
	{
		key: "insurance",
		name: "Insurance",
		color: "#0F766E",
		initials: "Ins",
		slug: "bills",
	},
	{
		key: "ptptn",
		name: "PTPTN",
		color: "#1C4E9E",
		initials: "PT",
		slug: "education",
	},
	{
		key: "carloan",
		name: "Car loan",
		color: "#334155",
		initials: "Car",
		slug: "transport",
	},
	{ key: "rent", name: "Rent", color: "#9A3412", initials: "R", slug: "home" },
] as const;
export type SubscriptionBrand = (typeof SUBSCRIPTION_BRANDS)[number];
export const brandOf = (
	key: string | null | undefined,
): SubscriptionBrand | undefined =>
	SUBSCRIPTION_BRANDS.find((b) => b.key === key);

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
