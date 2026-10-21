import { guessCategorySlug } from "./categories";
import { takePastDay } from "./past-day";

export interface QuickEntry {
	/** Major units as typed (6.5), or null when no number was found. */
	amount: number | null;
	/** ISO code when the text names one unambiguously, else null (use home currency). */
	currency: string | null;
	description: string;
	categorySlug: string | null;
	/** 0 for today; "yesterday", "monday", "3 oct" and the like count back from `today`. */
	daysAgo: number;
}

/** Only unambiguous markers — "$" alone could be USD, SGD or AUD, so it is not mapped. */
const CURRENCY_TOKENS: Record<string, string> = {
	rm: "MYR",
	ringgit: "MYR",
	myr: "MYR",
	usd: "USD",
	us$: "USD",
	sgd: "SGD",
	s$: "SGD",
	eur: "EUR",
	"€": "EUR",
	gbp: "GBP",
	"£": "GBP",
	jpy: "JPY",
	"¥": "JPY",
	idr: "IDR",
	rp: "IDR",
	thb: "THB",
	"฿": "THB",
	inr: "INR",
	"₹": "INR",
	aud: "AUD",
	a$: "AUD",
};

const AMOUNT = /\d[\d.,]*/g;

/** "1,250" → 1250, "1,250.50" → 1250.5, "3,20" → 3.2 (comma decimal). */
function toNumber(raw: string): number | null {
	let s = raw.replace(/[.,]$/, "");
	if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
	else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

function capitalise(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Words for "today" add nothing to the name (the day is already today). EN + BM. */
const TODAY_WORDS =
	/\s(?:today|tonight|this morning|this afternoon|just now|hari ini|tadi|pagi tadi|malam ini)(?=\s)/gi;
/** How people start a sentence about spending: "I spent", "paid", "saya belanja". */
const SPENT_LEAD =
	/^(?:(?:i|i've|i have|saya|aku)\s+)?(?:just\s+)?(?:spent|spend|paid|bought|belanja|beli|bayar|membeli|membayar)(?=\s|$)\s*/i;
/** …followed by "on/for/at": "I spent RM12 on Grab" is Grab. */
const LEAD_WORD = /^(?:on|for|at|untuk|kat|di|pada)\s+/i;

/** The words left after the amount and day: what it was, tidied for a name. */
function tidyDescription(rest: string): string {
	return rest
		.replace(TODAY_WORDS, " ")
		.replace(/\s+/g, " ")
		.replace(/\s+([,.;:!?)])/g, "$1")
		.replace(/\(\s+/g, "(")
		.replace(/^[\s,.;:!?()\u2013-]+|[\s,.;:!?()\u2013-]+$/g, "")
		.replace(SPENT_LEAD, "")
		.replace(LEAD_WORD, "")
		.trim();
}

/**
 * Turns shorthand like "coffee 6.50" or "rm12 grab yesterday" into a draft expense.
 * `today` is the person's calendar day, for words like "monday" or "3 oct".
 */
export function parseQuickEntry(
	text: string,
	today: string = new Date().toISOString().slice(0, 10),
): QuickEntry {
	// Day words first, so "3 oct" or "3 days ago" never become the amount.
	const past = takePastDay(` ${text.trim()} `, today);
	let rest = past.rest;
	let currency: string | null = null;

	// Split symbols glued to numbers ("rm12", "€120", "12rm") so tokens can be read.
	rest = rest
		.replace(/([^\d\s.,]+)(\d)/g, "$1 $2")
		.replace(/(\d)([^\d\s.,]+)/g, "$1 $2");

	rest = rest.replace(/\s(\S+)(?=\s)/g, (match, token: string) => {
		const code = CURRENCY_TOKENS[token.toLowerCase()];
		if (!code) return match;
		currency ??= code;
		return " ";
	});

	const numbers = [...rest.matchAll(AMOUNT)];
	const last = numbers.at(-1);
	const amount = last ? toNumber(last[0]) : null;
	if (last?.index !== undefined)
		rest = rest.slice(0, last.index) + rest.slice(last.index + last[0].length);

	const description = capitalise(tidyDescription(` ${rest} `));
	return {
		amount,
		currency,
		description,
		categorySlug: guessCategorySlug(description),
		daysAgo: past.daysAgo,
	};
}
