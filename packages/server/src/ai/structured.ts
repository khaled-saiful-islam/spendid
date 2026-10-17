import { type AiCallUsage, UnreadableAiAnswer } from "../errors";

interface StructuredOutput<T> {
	raw: unknown;
	parsed: T | null | undefined;
}

function usageOf(raw: unknown): { inputTokens: number; outputTokens: number } {
	const usage = (
		raw as {
			usage_metadata?: { input_tokens?: number; output_tokens?: number };
		}
	)?.usage_metadata;
	return {
		inputTokens: usage?.input_tokens ?? 0,
		outputTokens: usage?.output_tokens ?? 0,
	};
}

/**
 * `withStructuredOutput({ includeRaw: true })` hands back `parsed: null` when the model's
 * answer doesn't fit the schema. Turn that into an error that still carries the tokens spent.
 */
export function structuredResult<T>(
	out: StructuredOutput<T>,
	model: string,
): { parsed: T } & AiCallUsage {
	const usage = { ...usageOf(out.raw), model };
	if (out.parsed === null || out.parsed === undefined)
		throw new UnreadableAiAnswer(usage);
	return { parsed: out.parsed, ...usage };
}
