import { z } from "zod";
import { CHALLENGE_KINDS } from "./challenges";
import { RELATIONS, SHARE_LEVELS } from "./family";
import { EMAIL_GROUPS } from "./notifications";
import { LOCALES, ProfileInputSchema } from "./profile";
import { SplitInputSchema } from "./split";
import { BILLING_CYCLES, SubscriptionInputSchema } from "./subscriptions";
import { GoalInputSchema, TransactionPatchSchema } from "./transactions";
import { VoiceDraftSchema } from "./voice";

/** Chat history lives on the person's device; only the last few turns are sent with a question. */
export const AskTurnSchema = z.object({
	role: z.enum(["user", "assistant"]),
	text: z.string().max(4000),
});

export const AskRequestSchema = z.object({
	question: z
		.string()
		.trim()
		.min(1, "Ask a question")
		.max(500, "Keep it under 500 characters"),
	history: z.array(AskTurnSchema).max(12).default([]),
	/** Playful modes: a kind roast of the month's spending, or a hype-up of its wins. */
	tone: z.enum(["roast", "hype"]).optional(),
	/** A receipt photo or PDF attached to this question (already uploaded and read). */
	receiptId: z.uuid().optional(),
});
export type AskRequest = z.input<typeof AskRequestSchema>;

/** A chart the assistant chose to show. Values are minor units of `currency`. */
export const ChartSpecSchema = z.object({
	kind: z.enum(["bar", "line"]),
	title: z.string().max(80),
	currency: z.string().length(3),
	points: z
		.array(z.object({ label: z.string().max(40), value: z.number().int() }))
		.min(1)
		.max(31),
});
export type ChartSpec = z.infer<typeof ChartSpecSchema>;

/** How an expense looks on a card (before and after a change). */
export const ExpenseLookSchema = z.object({
	merchant: z.string().nullable(),
	amountMinor: z.number().int(),
	categoryName: z.string(),
	day: z.string(),
});
export type ExpenseLook = z.infer<typeof ExpenseLookSchema>;

/**
 * Something the assistant prepared for the person to create. Nothing is saved until they
 * confirm the card; the app then calls the normal API, so every rule and limit still applies.
 */
export const AskActionSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("goal"),
		name: z.string().max(60),
		emoji: z.string().max(8),
		targetMinor: z.number().int().positive(),
		currency: z.string().length(3),
		targetDate: z.string().nullable(),
	}),
	z.object({
		kind: z.literal("deposit"),
		goalId: z.uuid(),
		goalName: z.string(),
		emoji: z.string(),
		amountMinor: z.number().int(),
		currency: z.string().length(3),
		savedMinor: z.number().int(),
		targetMinor: z.number().int(),
		/** Someone else's shared jar the person saves into (not their own goal). */
		jar: z.boolean().optional(),
	}),
	z.object({
		kind: z.literal("budget"),
		categoryId: z.uuid(),
		categoryName: z.string(),
		/** null removes the limit. */
		limitMinor: z.number().int().min(0).nullable(),
		currency: z.string().length(3),
		spentMinor: z.number().int(),
	}),
	z.object({
		kind: z.literal("subscription"),
		name: z.string().max(60),
		brand: z.string().nullable(),
		amountMinor: z.number().int().positive(),
		currency: z.string().length(3),
		cycle: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
		nextDue: z.string(),
		categoryId: z.uuid(),
	}),
	z.object({
		kind: z.literal("wish"),
		name: z.string().max(80),
		priceMinor: z.number().int().positive(),
		currency: z.string().length(3),
	}),
	z.object({
		kind: z.literal("expense-edit"),
		transactionId: z.uuid(),
		currency: z.string().length(3),
		before: ExpenseLookSchema,
		after: ExpenseLookSchema,
		patch: TransactionPatchSchema,
		/** Puts the expense back as it was. */
		undo: TransactionPatchSchema,
	}),
	z.object({
		kind: z.literal("expense-delete"),
		transactionId: z.uuid(),
		currency: z.string().length(3),
		look: ExpenseLookSchema,
	}),
	z.object({
		kind: z.literal("subscription-paid"),
		subscriptionId: z.uuid(),
		name: z.string(),
		brand: z.string().nullable(),
		amountMinor: z.number().int().positive(),
		currency: z.string().length(3),
		due: z.string(),
	}),
	z.object({
		kind: z.literal("subscription-edit"),
		subscriptionId: z.uuid(),
		currency: z.string().length(3),
		before: z.object({
			name: z.string(),
			amountMinor: z.number().int(),
			cycle: z.enum(BILLING_CYCLES),
			nextDue: z.string(),
		}),
		input: SubscriptionInputSchema,
	}),
	z.object({
		kind: z.literal("subscription-cancel"),
		subscriptionId: z.uuid(),
		name: z.string(),
		brand: z.string().nullable(),
		amountMinor: z.number().int(),
		currency: z.string().length(3),
		cycle: z.enum(BILLING_CYCLES),
	}),
	z.object({
		kind: z.literal("goal-edit"),
		goalId: z.uuid(),
		currency: z.string().length(3),
		savedMinor: z.number().int(),
		before: z.object({
			name: z.string(),
			emoji: z.string(),
			targetMinor: z.number().int(),
			targetDate: z.string().nullable(),
		}),
		input: GoalInputSchema,
	}),
	z.object({
		kind: z.literal("goal-archive"),
		goalId: z.uuid(),
		goalName: z.string(),
		emoji: z.string(),
		currency: z.string().length(3),
		savedMinor: z.number().int(),
		targetMinor: z.number().int(),
	}),
	z.object({
		kind: z.literal("plan"),
		currency: z.string().length(3),
		before: z.object({
			incomeMinor: z.number().int().nullable(),
			method: z.string(),
		}),
		input: ProfileInputSchema,
	}),
	z.object({
		kind: z.literal("challenge-start"),
		challenge: z.enum(CHALLENGE_KINDS),
		targetMinor: z.number().int().positive().nullable(),
		currency: z.string().length(3),
	}),
	z.object({
		kind: z.literal("challenge-stop"),
		challengeId: z.uuid(),
		challenge: z.enum(CHALLENGE_KINDS),
	}),
	z.object({
		kind: z.literal("share"),
		personId: z.string().min(1).max(64),
		personName: z.string(),
		before: z.object({
			level: z.enum(SHARE_LEVELS),
			paused: z.boolean(),
		}),
		level: z.enum(SHARE_LEVELS),
		paused: z.boolean(),
	}),
	z.object({
		kind: z.literal("invite"),
		relation: z.enum(RELATIONS),
		level: z.enum(SHARE_LEVELS),
		email: z.email().nullable(),
	}),
	z.object({
		kind: z.literal("split"),
		input: SplitInputSchema,
		/** Each person's share, worked out on the server, for the card. */
		shares: z
			.array(z.object({ name: z.string(), totalMinor: z.number().int() }))
			.max(30),
	}),
	z.object({
		kind: z.literal("setting"),
		change: z.discriminatedUnion("setting", [
			z.object({ setting: z.literal("language"), locale: z.enum(LOCALES) }),
			z.object({ setting: z.literal("hide-amounts"), on: z.boolean() }),
			z.object({
				setting: z.literal("quiet-hours"),
				start: z.number().int().min(0).max(23),
				end: z.number().int().min(0).max(23),
			}),
			z.object({
				setting: z.literal("email"),
				group: z.enum(EMAIL_GROUPS),
				on: z.boolean(),
			}),
		]),
	}),
	z.object({ kind: z.literal("export") }),
	z.object({
		kind: z.literal("receipt"),
		receiptId: z.uuid(),
		merchant: z.string().nullable(),
		totalMinor: z.number().int().nullable(),
		currency: z.string().length(3),
	}),
]);
export type AskAction = z.infer<typeof AskActionSchema>;

/** Streamed to the app while the assistant works. */
export type AskEvent =
	| { type: "step"; label: string }
	| { type: "token"; text: string }
	| { type: "chart"; chart: ChartSpec }
	| { type: "drafts"; drafts: z.infer<typeof VoiceDraftSchema>[] }
	| { type: "actions"; actions: AskAction[] }
	| { type: "done" }
	| { type: "error"; message: string };

/** One saved chat message, as the app shows it. Strict so stored chats can't grow unbounded. */
export const StoredAskMessageSchema = z.object({
	id: z.string().min(1).max(64),
	role: z.enum(["user", "assistant"]),
	text: z.string().max(8000),
	/** A receipt photo the person attached to this question. */
	receiptId: z.uuid().nullable().optional(),
	steps: z.array(z.string().max(120)).max(20).default([]),
	charts: z.array(ChartSpecSchema).max(4).default([]),
	drafts: z.array(VoiceDraftSchema).max(10).nullable().default(null),
	actions: z
		.array(
			z.object({
				action: AskActionSchema,
				status: z.enum(["ready", "done", "dismissed", "undone"]),
			}),
		)
		.max(4)
		.optional(),
	status: z.enum(["done", "error"]),
});
export type StoredAskMessage = z.infer<typeof StoredAskMessageSchema>;

export const ASK_THREAD_MAX_MESSAGES = 60;

export const AskThreadSaveSchema = z.object({
	messages: z.array(StoredAskMessageSchema).min(1).max(ASK_THREAD_MAX_MESSAGES),
});
export type AskThreadSave = z.input<typeof AskThreadSaveSchema>;

export interface AskThreadSummary {
	id: string;
	title: string;
	messageCount: number;
	updatedAt: string;
	/** The last thing said, or the matching words when searching. */
	preview: string;
	hasChart: boolean;
	/** Something was created from this chat (a goal, a limit, expenses…). */
	madeSomething: boolean;
}

export interface AskThread extends AskThreadSummary {
	messages: StoredAskMessage[];
}
