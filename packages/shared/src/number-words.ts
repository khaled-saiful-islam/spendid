/**
 * Speech-to-text writes amounts as words ("forty five", "dua puluh"). This turns them into
 * digits so both the AI and the offline fallback see "45". English and Malay.
 */

const SMALL: Record<string, number> = {
	zero: 0,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	thirteen: 13,
	fourteen: 14,
	fifteen: 15,
	sixteen: 16,
	seventeen: 17,
	eighteen: 18,
	nineteen: 19,
	kosong: 0,
	satu: 1,
	dua: 2,
	tiga: 3,
	empat: 4,
	lima: 5,
	enam: 6,
	tujuh: 7,
	lapan: 8,
	sembilan: 9,
	sepuluh: 10,
	sebelas: 11,
};
const TENS: Record<string, number> = {
	twenty: 20,
	thirty: 30,
	forty: 40,
	fifty: 50,
	sixty: 60,
	seventy: 70,
	eighty: 80,
	ninety: 90,
};
/** Malay multipliers that follow a number: "dua puluh" = 20, "dua belas" = 12. */
const MALAY_AFTER: Record<string, (n: number) => number> = {
	puluh: (n) => n * 10,
	belas: (n) => n + 10,
};
const SCALE: Record<string, number> = {
	hundred: 100,
	ratus: 100,
	thousand: 1000,
	ribu: 1000,
};
/** "seratus" = 100, "seribu" = 1000. */
const MALAY_ONE_SCALE: Record<string, number> = { seratus: 100, seribu: 1000 };

const clean = (w: string) => w.toLowerCase().replace(/[^\p{L}]/gu, "");
const isNumberWord = (w: string) => {
	const c = clean(w);
	return (
		c in SMALL ||
		c in TENS ||
		c in SCALE ||
		c in MALAY_ONE_SCALE ||
		c in MALAY_AFTER
	);
};

interface Acc {
	total: number;
	current: number;
	last: "small" | "tens" | "scale" | null;
	decimals: string | null;
}

function value(acc: Acc): string {
	const whole = acc.total + acc.current;
	return acc.decimals ? `${whole}.${acc.decimals}` : String(whole);
}

export function wordsToDigits(text: string): string {
	const words = text.split(/(\s+)/);
	const out: string[] = [];
	let acc: Acc | null = null;
	let trailing = "";
	let gap = "";

	const flush = () => {
		if (acc) out.push(value(acc) + trailing + gap);
		acc = null;
		trailing = "";
		gap = "";
	};

	for (let i = 0; i < words.length; i++) {
		const raw = words[i] ?? "";
		if (/^\s+$/.test(raw)) {
			if (acc) gap = raw;
			else out.push(raw);
			continue;
		}
		gap = acc ? gap : "";
		const word = clean(raw);
		const next = clean(words[i + 2] ?? "");
		const punct = raw.match(/[^\p{L}\p{N}]+$/u)?.[0] ?? "";

		if (
			acc &&
			acc.decimals !== null &&
			word in SMALL &&
			(SMALL[word] ?? 10) < 10
		) {
			acc.decimals += String(SMALL[word]);
		} else if (acc && word === "point" && next in SMALL) {
			acc.decimals = "";
		} else if (
			acc &&
			word === "and" &&
			acc.last === "scale" &&
			isNumberWord(next)
		) {
			// "one hundred and twenty" — the "and" is part of the number.
		} else if (word === "a" && next in SCALE && !acc) {
			acc = { total: 0, current: 1, last: "small", decimals: null };
		} else if (word in MALAY_ONE_SCALE) {
			if (!acc) acc = { total: 0, current: 0, last: null, decimals: null };
			acc.current += MALAY_ONE_SCALE[word] ?? 0;
			acc.last = "scale";
		} else if (acc && word in MALAY_AFTER && acc.last === "small") {
			acc.current = (MALAY_AFTER[word] ?? ((n: number) => n))(acc.current);
			acc.last = "tens";
		} else if (acc && word in SCALE) {
			const scale = SCALE[word] ?? 1;
			if (scale === 1000) {
				acc.total += (acc.current || 1) * 1000;
				acc.current = 0;
			} else {
				acc.current = (acc.current || 1) * scale;
			}
			acc.last = "scale";
		} else if (word in TENS) {
			if (acc && acc.last !== "scale") flush();
			if (!acc) acc = { total: 0, current: 0, last: null, decimals: null };
			acc.current += TENS[word] ?? 0;
			acc.last = "tens";
		} else if (word in SMALL) {
			const n = SMALL[word] ?? 0;
			// "forty five" joins; "fifteen six" is two numbers.
			const joinsTens =
				acc?.last === "tens" && acc.current % 10 === 0 && n < 10;
			if (acc && !(acc.last === "scale" || joinsTens)) flush();
			if (!acc) acc = { total: 0, current: 0, last: null, decimals: null };
			acc.current += n;
			acc.last = "small";
		} else {
			flush();
			out.push(raw);
			continue;
		}
		trailing = punct;
		if (punct) flush();
	}
	flush();
	return out.join("").replace(/\s+/g, " ").trim();
}
