/** Where a person's monthly AI allowance went, and what's left in everyday terms. */
export interface AiUsage {
	enabled: boolean;
	pausedForEveryone: boolean;
	usedTokens: number;
	limitTokens: number;
	/** First day of next month (YYYY-MM-DD), when the allowance starts again. */
	resetsOn: string;
	features: AiFeatureUse[];
	/** Roughly how many more of each the remaining allowance covers. */
	left: { questions: number; voiceNotes: number; receipts: number };
}

export interface AiFeatureUse {
	key: "ask" | "voice" | "receipts" | "shops";
	tokens: number;
	/** Questions asked, phrases heard, receipts read, shops matched. */
	uses: number;
}

/** Typical cost of one use when there's no history yet (measured on ILMU in dev). */
export const TYPICAL_TOKENS = {
	question: 6_000,
	voiceNote: 2_500,
	receipt: 3_500,
} as const;

interface FeatureRow {
	feature: string;
	tokens: number;
	rows: number;
}

/** Groups ledger rows into the features people know, and estimates what's left. */
export function summariseAiUsage(
	rows: FeatureRow[],
	usedTokens: number,
	limitTokens: number,
): Pick<AiUsage, "features" | "left"> {
	const sum = (names: string[]) =>
		rows
			.filter((r) => names.includes(r.feature))
			.reduce((n, r) => n + r.tokens, 0);
	const count = (name: string) =>
		rows.find((r) => r.feature === name)?.rows ?? 0;
	const questions = count("ask-question");
	const phrases = count("voice-understand") || count("voice-listen");
	const receipts = count("receipt-read");
	const features: AiFeatureUse[] = [
		{ key: "ask", tokens: sum(["ask", "ask-question"]), uses: questions },
		{
			key: "voice",
			tokens: sum(["voice-listen", "voice-understand"]),
			uses: phrases,
		},
		{ key: "receipts", tokens: sum(["receipt-read"]), uses: receipts },
		{
			key: "shops",
			tokens: sum(["merchant-match"]),
			uses: count("merchant-match"),
		},
	];
	const avg = (tokens: number, uses: number, typical: number) =>
		uses >= 3 ? Math.max(500, tokens / uses) : typical;
	const remaining = Math.max(0, limitTokens - usedTokens);
	const per = {
		question: avg(features[0]?.tokens ?? 0, questions, TYPICAL_TOKENS.question),
		voiceNote: avg(features[1]?.tokens ?? 0, phrases, TYPICAL_TOKENS.voiceNote),
		receipt: avg(features[2]?.tokens ?? 0, receipts, TYPICAL_TOKENS.receipt),
	};
	return {
		features,
		left: {
			questions: Math.floor(remaining / per.question),
			voiceNotes: Math.floor(remaining / per.voiceNote),
			receipts: Math.floor(remaining / per.receipt),
		},
	};
}
