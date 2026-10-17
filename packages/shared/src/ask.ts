import { z } from "zod";
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
	}),
	z.object({
		kind: z.literal("budget"),
		categoryId: z.uuid(),
		categoryName: z.string(),
		limitMinor: z.number().int().min(0),
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
	steps: z.array(z.string().max(120)).max(20).default([]),
	charts: z.array(ChartSpecSchema).max(4).default([]),
	drafts: z.array(VoiceDraftSchema).max(10).nullable().default(null),
	actions: z
		.array(
			z.object({
				action: AskActionSchema,
				status: z.enum(["ready", "done", "dismissed"]),
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
