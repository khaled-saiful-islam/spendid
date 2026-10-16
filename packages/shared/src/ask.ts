import { z } from "zod";
import type { VoiceDraftSchema } from "./voice";

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

/** Streamed to the app while the assistant works. */
export type AskEvent =
	| { type: "step"; label: string }
	| { type: "token"; text: string }
	| { type: "chart"; chart: ChartSpec }
	| { type: "drafts"; drafts: z.infer<typeof VoiceDraftSchema>[] }
	| { type: "done" }
	| { type: "error"; message: string };
