import { hasSpokenAmount } from "@spendid/shared";

/** Spending said as a fact ("Yesterday I spent RM49 on groceries"): a purchase to log. EN + BM. */
const SPENDING_VERB =
	/\b(spent|spend|paid|bought|belanja|berbelanja|beli|membeli|bayar|membayar)\b/i;
/** A question rather than telling: "did I spend…?", "berapa…". */
const ASKING =
	/\?|^\s*(how|what|did|do|does|when|which|where|why|is|are|was|were|can|could|should|have|has|berapa|apa|apakah|adakah|bila|mana|kenapa|mengapa|boleh)\b/i;

export function tellsAPurchase(question: string): boolean {
	return (
		SPENDING_VERB.test(question) &&
		!ASKING.test(question) &&
		hasSpokenAmount(question)
	);
}

const MALAY =
	/\b(saya|aku|semalam|kelmarin|belanja|berapa|untuk|dengan|dan|hari|minggu|bulan|ini|lepas|tadi|apa|boleh|tolong|makan|beli|bayar)\b/gi;
const ENGLISH =
	/\b(i|my|me|yesterday|today|spent|spend|how|much|what|the|for|on|and|week|month|last|this|did|please|can|paid|bought)\b/gi;

/** The language a question is written in, by its everyday words; `fallback` when unclear. */
export function questionLanguage(
	question: string,
	fallback: "en" | "ms",
): "en" | "ms" {
	const ms = question.match(MALAY)?.length ?? 0;
	const en = question.match(ENGLISH)?.length ?? 0;
	return ms === en ? fallback : ms > en ? "ms" : "en";
}
