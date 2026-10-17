import { describe, expect, it } from "vitest";
import { summariseAiUsage, TYPICAL_TOKENS } from "./ai-usage";

describe("summariseAiUsage", () => {
	it("groups features and estimates from real averages once there's history", () => {
		const out = summariseAiUsage(
			[
				{ feature: "ask", tokens: 40_000, rows: 9 },
				{ feature: "ask-question", tokens: 0, rows: 4 },
				{ feature: "voice-listen", tokens: 1_000, rows: 2 },
				{ feature: "voice-understand", tokens: 3_000, rows: 2 },
			],
			44_000,
			144_000,
		);
		expect(out.features[0]).toEqual({ key: "ask", tokens: 40_000, uses: 4 });
		expect(out.features[1]).toEqual({ key: "voice", tokens: 4_000, uses: 2 });
		// 100k left at 10k a question.
		expect(out.left.questions).toBe(10);
		// Too few voice notes to trust: the typical cost is used.
		expect(out.left.voiceNotes).toBe(
			Math.floor(100_000 / TYPICAL_TOKENS.voiceNote),
		);
	});

	it("never goes below zero when the allowance is used up", () => {
		expect(summariseAiUsage([], 300, 200).left).toEqual({
			questions: 0,
			voiceNotes: 0,
			receipts: 0,
		});
	});
});
