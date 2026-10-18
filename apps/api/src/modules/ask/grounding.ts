/**
 * The red line: every amount, percentage and count in an answer must come from this
 * question's own tool results (or the question itself). Anything else is a guess, and a
 * guess about someone's money is never shown.
 */

const CURRENCY = String.raw`(?:RM|MYR|SGD|USD|THB|IDR|PHP|VND|EUR|GBP|JPY|AUD|INR|CNY|S\$|US\$|\$|€|£|¥)`;
const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;

const MONEY = new RegExp(
	String.raw`(?<![A-Za-z])${CURRENCY}\s?${NUMBER}`,
	"gi",
);
const PERCENT = new RegExp(String.raw`(?<![\w.])${NUMBER}\s?%`, "g");
const COUNT =
	/(?<![\w.,])(\d+)\s+(?:expenses?|transactions?|purchases?|payments?|times|rides?|trips?|bills?|subscriptions?|items?|transaksi|perbelanjaan|pembelian|bayaran|kali)\b/gi;
/** "12.50" with no currency in front is still money. */
const BARE_DECIMAL = /(?<![\w.,])\d[\d,]*\.\d{2}(?![\d%])/g;
const ANY_NUMBER = /-?\d[\d,]*(?:\.\d+)?/g;

interface Claim {
	text: string;
	value: number;
	decimals: number;
	at: number;
}

function toNumber(text: string): { value: number; decimals: number } | null {
	const digits = text.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
	if (!digits) return null;
	const plain = digits.replace(/,/g, "");
	return {
		value: Number(plain),
		decimals: plain.includes(".") ? (plain.split(".")[1]?.length ?? 0) : 0,
	};
}

function roundTo(x: number, decimals: number): number {
	const f = 10 ** decimals;
	return Math.round(Number((Math.abs(x) * f).toPrecision(15))) / f;
}

/** Every money amount, percentage and count the answer states, in order. */
function claims(answer: string): Claim[] {
	const found: Claim[] = [];
	const taken: [number, number][] = [];
	const overlaps = (start: number, end: number) =>
		taken.some(([s, e]) => start < e && end > s);
	for (const pattern of [MONEY, PERCENT, COUNT, BARE_DECIMAL]) {
		for (const m of answer.matchAll(pattern)) {
			const start = m.index ?? 0;
			const end = start + m[0].length;
			if (overlaps(start, end)) continue;
			const n = toNumber(m[0]);
			if (!n) continue;
			taken.push([start, end]);
			found.push({ text: m[0].trim(), at: start, ...n });
		}
	}
	return found.sort((a, b) => a.at - b.at);
}

/** All numbers in the tool results (and the question), once each. */
function sourceNumbers(sources: string[]): number[] {
	const out = new Set<number>();
	for (const s of sources)
		for (const m of s.matchAll(ANY_NUMBER)) {
			const v = Number(m[0].replace(/,/g, ""));
			if (Number.isFinite(v)) out.add(v);
		}
	return [...out];
}

/** True when `value`, at `decimals` places, is one of the source numbers rounded the same way. */
export function isGrounded(
	value: number,
	sources: string[],
	decimals = 2,
): boolean {
	const target = roundTo(value, decimals);
	return sourceNumbers(sources).some(
		// Sizes: "dropped by RM 153.80" is a difference calculate returned as -153.8.
		(s) => roundTo(s, decimals) === target,
	);
}

/** The answer's numbers that don't come from the sources; empty means every number checks out. */
export function ungroundedNumbers(answer: string, sources: string[]): string[] {
	const known = sourceNumbers(sources);
	return claims(answer)
		.filter(
			(c) =>
				!known.some(
					(s) => roundTo(s, c.decimals) === roundTo(c.value, c.decimals),
				),
		)
		.map((c) => c.text);
}
