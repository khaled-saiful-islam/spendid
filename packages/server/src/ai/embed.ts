import { z } from "zod";
import { ServiceError } from "../errors";

export interface Embeddings {
	vectors: number[][];
	tokens: number;
	model: string;
}

export type Embedder = (texts: string[]) => Promise<Embeddings>;

const ReplySchema = z.object({
	data: z.array(
		z.object({ embedding: z.array(z.number()), index: z.number().optional() }),
	),
	usage: z
		.object({
			total_tokens: z.number().optional(),
			prompt_tokens: z.number().optional(),
		})
		.partial()
		.optional(),
});

const TIMEOUT_MS = 10_000;

/** ILMU embeddings over the OpenAI `/embeddings` shape. Only shop names are sent, never amounts. */
export function createEmbedder(cfg: {
	baseUrl: string;
	apiKey: string;
	model: string;
}): Embedder {
	return async (texts) => {
		const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/embeddings`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${cfg.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ model: cfg.model, input: texts }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok)
			throw new ServiceError(502, `Embedding service replied ${res.status}.`);
		const reply = ReplySchema.parse(await res.json());
		const ordered = [...reply.data].sort(
			(a, b) => (a.index ?? 0) - (b.index ?? 0),
		);
		return {
			vectors: ordered.map((d) => d.embedding),
			tokens: reply.usage?.total_tokens ?? reply.usage?.prompt_tokens ?? 0,
			model: cfg.model,
		};
	};
}
