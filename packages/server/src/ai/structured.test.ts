import { describe, expect, it } from "vitest";
import { UnreadableAiAnswer } from "../errors";
import { structuredResult } from "./structured";

const raw = { usage_metadata: { input_tokens: 900, output_tokens: 40 } };

describe("structuredResult", () => {
	it("returns the parsed answer with its token counts", () => {
		expect(structuredResult({ raw, parsed: { ok: true } }, "m")).toEqual({
			parsed: { ok: true },
			inputTokens: 900,
			outputTokens: 40,
			model: "m",
		});
	});

	it("throws a non-retryable error that still carries the tokens spent when the answer doesn't fit", () => {
		try {
			structuredResult({ raw, parsed: null }, "m");
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(UnreadableAiAnswer);
			expect((err as UnreadableAiAnswer).usage).toEqual({
				inputTokens: 900,
				outputTokens: 40,
				model: "m",
			});
		}
	});
});
