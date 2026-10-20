/**
 * Turns what a card terminal or receipt prints into a name people recognise:
 * "SQ *TEALIVE @ KLCC SDN BHD #0423" → "Tealive". Deterministic and offline; the API also
 * matches new names to ones the person already uses (pgvector) so variants merge.
 */

const PROCESSOR_PREFIX =
	/^(?:sq|sp|pp|paypal|stripe|ipay88|razer|molpay|pos|purchase)\s*[*#:]\s*/i;
const LEGAL_SUFFIX =
	/[\s,.]+(?:sdn\.?\s*bhd\.?|bhd\.?|berhad|plt|pte\.?\s*ltd\.?|ltd\.?|limited|inc\.?|llc|corp\.?|co\.?|gmbh|enterprise|trading)$/i;
const LOCATION_SUFFIX = /\s+(?:@|-|–|—)\s+.+$/;
const STORE_NUMBER = /\s*(?:#\s*\d+|no\.?\s*\d+|\b\d{3,}\b)\s*$/i;
const TRAILING_PARENS = /\s*\([^)]*\)\s*$/;

function titleCase(text: string): string {
	return text
		.toLowerCase()
		.replace(
			/(^|[\s&/-])(\p{L})/gu,
			(_, sep: string, ch: string) => sep + ch.toUpperCase(),
		);
}

/** A clean display name, or the trimmed input when cleaning would leave nothing. */
export function cleanMerchant(raw: string): string {
	const original = raw.replace(/\s+/g, " ").trim();
	let name = original.replace(PROCESSOR_PREFIX, "");
	// Peel suffixes until nothing changes ("X SDN BHD (M) #12" needs several passes).
	for (let i = 0; i < 4; i++) {
		const before = name;
		name = name
			.replace(TRAILING_PARENS, "")
			.replace(STORE_NUMBER, "")
			.replace(LEGAL_SUFFIX, "")
			.replace(LOCATION_SUFFIX, "")
			.trim();
		if (name === before) break;
	}
	name = name.replace(/[\s,.*#:-]+$/, "").trim();
	if (!name) return original;
	const shouting = name === name.toUpperCase() && /\p{L}{2}/u.test(name);
	const whispering = name === name.toLowerCase();
	return shouting || whispering ? titleCase(name) : name;
}

/** The comparison key: case, punctuation and spacing ignored. */
export function merchantKey(raw: string): string {
	return cleanMerchant(raw)
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

/**
 * Two shop keys for the same service: equal, or one is the other plus more words
 * ("unifi" and "unifi internet"). Keys come from `merchantKey`.
 */
export function sameMerchant(a: string, b: string): boolean {
	if (!a || !b) return false;
	return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

/** How many single-letter edits turn one string into the other. */
function editDistance(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++)
			row[j] = Math.min(
				(prev[j] ?? 0) + 1,
				(row[j - 1] ?? 0) + 1,
				(prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		prev = row;
	}
	return prev[b.length] ?? 0;
}

/**
 * Two shop keys that look like one shop written two ways: the same apart from spaces
 * ("grab food" / "grabfood"), one inside the other at a word boundary ("tealive klcc" /
 * "tealive"), or a small typo ("starbuck" / "starbucks"). Names that only mean something
 * similar ("lunch in office" / "for breakfast in office") are different things.
 */
export function looksLikeSameShop(a: string, b: string): boolean {
	if (!a || !b) return false;
	const squash = (s: string) => s.replace(/\s+/g, "");
	const x = squash(a);
	const y = squash(b);
	if (x === y) return true;
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	if (long.startsWith(`${short} `) || long.endsWith(` ${short}`)) return true;
	const longest = Math.max(x.length, y.length);
	return longest >= 5 && 1 - editDistance(x, y) / longest >= 0.85;
}
