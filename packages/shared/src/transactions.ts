import { z } from "zod";
import { BUDGET_METHODS, CurrencyCodeSchema } from "./profile";

const MAX_MINOR = 1_000_000_000_000;

export const CategorySchema = z.object({
	id: z.uuid(),
	slug: z.string(),
	name: z.string(),
	icon: z.string(),
	tint: z.string(),
	kind: z.enum(["need", "want", "saving"]),
});
export type Category = z.infer<typeof CategorySchema>;

export const ENTRY_SOURCES = ["manual", "voice", "photo", "chat"] as const;

export const TransactionInputSchema = z.object({
	amountMinor: z
		.number()
		.int()
		.positive("Enter an amount above zero")
		.max(MAX_MINOR),
	currency: CurrencyCodeSchema,
	categoryId: z.uuid("Pick a category"),
	merchant: z.string().trim().max(80).nullish(),
	note: z.string().trim().max(280).nullish(),
	occurredAt: z.iso
		.datetime({ offset: true })
		.refine(
			(v) => new Date(v).getTime() <= Date.now() + 86_400_000,
			"That date is in the future",
		)
		.optional(),
	source: z.enum(ENTRY_SOURCES).default("manual"),
});
export type TransactionInput = z.input<typeof TransactionInputSchema>;

export const TransactionPatchSchema = TransactionInputSchema.omit({
	source: true,
}).partial();
export type TransactionPatch = z.input<typeof TransactionPatchSchema>;

export const TransactionSchema = z.object({
	id: z.uuid(),
	amountMinor: z.number(),
	currency: z.string(),
	homeAmountMinor: z.number(),
	homeCurrency: z.string(),
	fxRate: z.number(),
	categoryId: z.uuid(),
	merchant: z.string().nullable(),
	note: z.string().nullable(),
	source: z.enum(ENTRY_SOURCES),
	occurredAt: z.string(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const TransactionPageSchema = z.object({
	items: z.array(TransactionSchema),
	nextCursor: z.string().nullable(),
});
export type TransactionPage = z.infer<typeof TransactionPageSchema>;

export const SummarySchema = z.object({
	homeCurrency: z.string(),
	method: z.enum(BUDGET_METHODS),
	incomeMinor: z.number().nullable(),
	reservedMinor: z.number(),
	daysLeft: z.number(),
	monthSpentMinor: z.number(),
	safe: z.object({
		status: z.enum(["ok", "over", "no-income"]),
		dailyAllowanceMinor: z.number(),
		safeTodayMinor: z.number(),
		leftThisMonthMinor: z.number(),
	}),
	today: z.array(TransactionSchema),
	byCategory: z.array(
		z.object({ categoryId: z.uuid(), spentMinor: z.number() }),
	),
	/** Bills and subscriptions still expected this month (already taken out of safe-to-spend). */
	bills: z.object({
		minor: z.number(),
		items: z.array(
			z.object({
				merchant: z.string(),
				day: z.string(),
				amountMinor: z.number(),
			}),
		),
	}),
});
export type Summary = z.infer<typeof SummarySchema>;

export const BudgetInputSchema = z.object({
	categoryId: z.uuid(),
	monthlyLimitMinor: z.number().int().min(0).max(MAX_MINOR).nullable(),
});
export type BudgetInput = z.infer<typeof BudgetInputSchema>;

export const BudgetLineSchema = z.object({
	categoryId: z.uuid(),
	monthlyLimitMinor: z.number(),
});
export type BudgetLine = z.infer<typeof BudgetLineSchema>;

export const GoalInputSchema = z.object({
	name: z.string().trim().min(1, "Name your goal").max(60),
	emoji: z.string().trim().min(1).max(8).default("🎯"),
	targetMinor: z
		.number()
		.int()
		.positive("Set a target above zero")
		.max(MAX_MINOR),
	targetDate: z.iso.date().nullable().optional(),
});
export type GoalInput = z.input<typeof GoalInputSchema>;

export const GoalSchema = z.object({
	id: z.uuid(),
	name: z.string(),
	emoji: z.string(),
	targetMinor: z.number(),
	savedMinor: z.number(),
	targetDate: z.string().nullable(),
	monthlyNeededMinor: z.number(),
});
export type Goal = z.infer<typeof GoalSchema>;

export const GoalDepositSchema = z.object({
	amountMinor: z
		.number()
		.int()
		.refine((n) => n !== 0, "Enter an amount")
		.refine((n) => Math.abs(n) <= MAX_MINOR),
});
