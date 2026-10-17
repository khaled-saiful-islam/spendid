import { z } from "zod";
import { wordsToDigits } from "./number-words";
import { parseQuickEntry, type QuickEntry } from "./quick-entry";

/** How far back an expense said or typed in words can go (about three months). */
export const MAX_DAYS_BACK = 92;

/** One expense heard in a voice note, ready to review before saving. */
export const VoiceDraftSchema = z.object({
	amountMinor: z.number().int().positive(),
	currency: z.string().length(3),
	merchant: z.string(),
	categoryId: z.uuid().nullable(),
	daysAgo: z.number().int().min(0).max(MAX_DAYS_BACK),
	note: z.string().nullable(),
});
export type VoiceDraft = z.infer<typeof VoiceDraftSchema>;

export const VoiceResultSchema = z.object({
	transcript: z.string(),
	drafts: z.array(VoiceDraftSchema),
	/** "ai" when ILMU read it; "quick" when the offline splitter did (AI off or allowance used up). */
	readBy: z.enum(["ai", "quick"]),
});
export type VoiceResult = z.infer<typeof VoiceResultSchema>;

const CURRENCY_WORD =
	/^(rm|ringgit|myr|usd|dollars?|bucks|sgd|eur|euros?|gbp|pounds?|yen|rupiah|baht|rupees?|sen)$/i;

/**
 * Offline fallback for one-breath logging: "Grab 15 coffee 6 ringgit and 40 for dinner"
 * → ["Grab 15", "coffee 6 ringgit", "40 for dinner"]. Splits on commas / "and" / "then",
 * and after any number that isn't followed by a currency word.
 */
export function splitSpokenEntries(text: string): string[] {
	const parts = text
		.split(/\s*(?:,|;|\band\b|\bthen\b|\bdan\b|\blepas tu\b)\s*/i)
		.filter(Boolean);
	const out: string[] = [];
	for (const part of parts) {
		const words = part.split(/\s+/);
		let current: string[] = [];
		for (let i = 0; i < words.length; i++) {
			const w = words[i] ?? "";
			current.push(w);
			const next = words[i + 1];
			const hasLaterWords = i < words.length - 1;
			const isNumber = /^\d+(?:[.,]\d+)?$/.test(w.replace(/^(rm|\$|€|£)/i, ""));
			if (isNumber && hasLaterWords && !(next && CURRENCY_WORD.test(next))) {
				// A number with words before it ends an item ("Grab 15 | coffee ...").
				if (current.length > 1) {
					out.push(current.join(" "));
					current = [];
				}
			}
		}
		if (current.length) out.push(current.join(" "));
	}
	// Word-only fragments ("for dinner") attach to the item before them.
	const merged: string[] = [];
	for (const piece of out) {
		const prev = merged.at(-1);
		if (prev !== undefined && !/\d/.test(piece))
			merged[merged.length - 1] = `${prev} ${piece}`;
		else merged.push(piece);
	}
	return merged.filter((p) => /\d/.test(p));
}

/** Greetings, filler and "today" words people say around items, in English and Malay. */
const FILLER =
	/\b(hi|hello|hey|hai|helo|assalamualaikum|salam|good (morning|afternoon|evening)|selamat (pagi|petang|malam)|um+|uh+|erm*|ah+|eh+|hmm+|okay|ok|so|well|like|actually|basically|yeah|right|lah|kan|tu|ni|today|tonight|this (morning|afternoon|evening)|hari ini|tadi)\b/gi;
/** "I spent", "paid", "saya belanja": how the spending is said, not what it was on. */
const SPENDING_WORDS =
	/\b((i|we|saya|aku|kami)\s+)?(spent|spend|paid|pay|bought|buy|got|had|belanja|bayar|beli|habis)\b/gi;
/** Little words left hanging at either end once the rest is gone ("in grab", "for the gym"). */
const EDGE_WORDS =
	"on|in|at|for|from|to|the|a|an|kat|di|untuk|dekat|pada|dari|ke";
const LEADING = new RegExp(`^((${EDGE_WORDS})\\s+)+`, "i");
const TRAILING = new RegExp(`(\\s+(${EDGE_WORDS}))+$`, "i");

/** The shop or item from a spoken piece: "hi I spent in grab" → "Grab". */
export function cleanSpokenDescription(description: string): string {
	const cleaned = description
		.replace(FILLER, " ")
		.replace(SPENDING_WORDS, " ")
		.replace(/[.,!?]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(LEADING, "")
		.replace(TRAILING, "")
		.trim();
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Whether a phrase names any amount (in digits or spoken words): no amount, nothing to log. */
export function hasSpokenAmount(text: string): boolean {
	return /\d/.test(wordsToDigits(text));
}

/** Fallback read of a transcript: split, then parse each piece like typed shorthand. */
export function quickReadSpoken(text: string, today?: string): QuickEntry[] {
	return splitSpokenEntries(text)
		.map((piece) => parseQuickEntry(piece, today))
		.filter((e) => e.amount !== null && e.amount > 0)
		.map((e) => ({ ...e, description: cleanSpokenDescription(e.description) }));
}
