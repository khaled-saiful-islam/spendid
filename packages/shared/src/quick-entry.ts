import { guessCategorySlug } from "./categories";

export interface QuickEntry {
	/** Major units as typed (6.5), or null when no number was found. */
	amount: number | null;
	/** ISO code when the text names one unambiguously, else null (use home currency). */
	currency: string | null;
	description: string;
	categorySlug: string | null;
	daysAgo: 0 | 1;
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

/** Turns shorthand like "coffee 6.50" or "rm12 grab yesterday" into a draft expense. */
export function parseQuickEntry(text: string): QuickEntry {
	let rest = ` ${text.trim()} `;
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

	let daysAgo: 0 | 1 = 0;
	rest = rest.replace(/\s(yesterday|semalam)(?=\s)/gi, () => {
		daysAgo = 1;
		return " ";
	});

	const numbers = [...rest.matchAll(AMOUNT)];
	const last = numbers.at(-1);
	const amount = last ? toNumber(last[0]) : null;
	if (last?.index !== undefined)
		rest = rest.slice(0, last.index) + rest.slice(last.index + last[0].length);

	const description = capitalise(
		rest
			.replace(/\s+/g, " ")
			.replace(/^[\s,.;:\u2013-]+|[\s,.;:\u2013-]+$/g, "")
			.trim(),
	);
	return {
		amount,
		currency,
		description,
		categorySlug: guessCategorySlug(description),
		daysAgo,
	};
}
