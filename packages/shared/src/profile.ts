import { z } from "zod";

export const BUDGET_METHODS = [
	"envelope",
	"zero_based",
	"fifty_thirty_twenty",
	"pay_yourself_first",
] as const;
export const LOCALES = ["en", "ms"] as const;
export const ROLES = ["user", "admin"] as const;

export type BudgetMethod = (typeof BUDGET_METHODS)[number];
export type Locale = (typeof LOCALES)[number];

const currencies = new Set(Intl.supportedValuesOf("currency"));
const timeZones = new Set([...Intl.supportedValuesOf("timeZone"), "UTC"]);

export const CurrencyCodeSchema = z
	.string()
	.trim()
	.toUpperCase()
	.refine((c) => currencies.has(c), "Pick a currency from the list");

export const TimeZoneSchema = z
	.string()
	.refine((tz) => timeZones.has(tz), "Pick a time zone from the list");

/** What onboarding and the Me page send. Income is monthly, in minor units. */
export const ProfileInputSchema = z.object({
	name: z.string().trim().min(1, "Tell us what to call you").max(60),
	homeCurrency: CurrencyCodeSchema,
	locale: z.enum(LOCALES),
	timeZone: TimeZoneSchema,
	monthlyIncomeMinor: z
		.number()
		.int()
		.min(0)
		.max(10_000_000_000_000)
		.nullable(),
	budgetMethod: z.enum(BUDGET_METHODS),
});

export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export const MeSchema = z.object({
	user: z.object({
		id: z.string(),
		name: z.string(),
		email: z.email(),
		username: z.string().nullable(),
		role: z.enum(ROLES),
		emailVerified: z.boolean(),
	}),
	profile: ProfileInputSchema.omit({ name: true }).extend({
		onboardedAt: z.string().nullable(),
	}),
	needsOnboarding: z.boolean(),
	/** Spending exists, so the home currency is fixed (changing it would mix past amounts). */
	currencyLocked: z.boolean(),
});

export type Me = z.infer<typeof MeSchema>;

/** Every JSON API response uses this envelope. */
export type ApiResponse<T> =
	| { success: true; data: T }
	| { success: false; error: string; fields?: Record<string, string> };
