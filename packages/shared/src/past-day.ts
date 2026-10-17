/**
 * Words for an earlier day in typed shorthand, in English and Malay: "yesterday",
 * "kelmarin", "3 days ago", "monday", "last fri", "3 oct", "oct 3", "3/10" (day/month).
 */

const DAY_MS = 86_400_000;

/** Sunday-first, matching Date.getUTCDay(). */
const WEEKDAYS: string[][] = [
	["sunday", "sun", "ahad"],
	["monday", "mon", "isnin"],
	["tuesday", "tue", "tues", "selasa"],
	["wednesday", "wed", "rabu"],
	["thursday", "thu", "thur", "thurs", "khamis"],
	["friday", "fri", "jumaat"],
	["saturday", "sat", "sabtu"],
];

const MONTHS: string[][] = [
	["january", "jan", "januari"],
	["february", "feb", "februari"],
	["march", "mar", "mac"],
	["april", "apr"],
	["may", "mei"],
	["june", "jun"],
	["july", "jul", "julai"],
	["august", "aug", "ogos"],
	["september", "sep", "sept"],
	["october", "oct", "oktober"],
	["november", "nov"],
	["december", "dec", "disember"],
];

const indexOf = (table: string[][], word: string): number =>
	table.findIndex((names) => names.includes(word.toLowerCase()));

const alternatives = (table: string[][]): string =>
	table
		.flat()
		.sort((a, b) => b.length - a.length)
		.join("|");

const WEEKDAY = alternatives(WEEKDAYS);
const MONTH = alternatives(MONTHS);
const ORDINAL = "(?:st|nd|rd|th|hb)?";
const ON = "(?:(?:on|pada)\\s+)?";

const toUtc = (day: string): number => Date.parse(`${day}T00:00:00Z`);

/** Days from `month`/`date` (this year, or last year if still ahead) back to today. */
function daysBack(today: string, month: number, date: number): number | null {
	const now = toUtc(today);
	const year = new Date(now).getUTCFullYear();
	for (const y of [year, year - 1]) {
		const at = Date.UTC(y, month, date);
		const check = new Date(at);
		if (check.getUTCMonth() !== month || check.getUTCDate() !== date)
			return null;
		if (at <= now) return Math.round((now - at) / DAY_MS);
	}
	return null;
}

interface Rule {
	pattern: RegExp;
	daysAgo: (m: RegExpExecArray, today: string) => number | null;
}

const RULES: Rule[] = [
	{
		pattern: /\s(\d{1,3})\s+(?:days?|hari)\s+(?:ago|lepas|lalu)(?=\s)/i,
		daysAgo: (m) => Number(m[1]),
	},
	{
		pattern: /\s(?:the\s+)?day\s+before\s+yesterday(?=\s)|\skelmarin(?=\s)/i,
		daysAgo: () => 2,
	},
	{ pattern: /\s(?:yesterday|semalam)(?=\s)/i, daysAgo: () => 1 },
	{
		pattern: new RegExp(
			`\\s${ON}(\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?(${MONTH})(?=\\s)`,
			"i",
		),
		daysAgo: (m, today) =>
			daysBack(today, indexOf(MONTHS, m[2] ?? ""), Number(m[1])),
	},
	{
		pattern: new RegExp(
			`\\s${ON}(${MONTH})\\s+(\\d{1,2})${ORDINAL}(?=\\s)`,
			"i",
		),
		daysAgo: (m, today) =>
			daysBack(today, indexOf(MONTHS, m[1] ?? ""), Number(m[2])),
	},
	{
		pattern: new RegExp(`\\s${ON}(\\d{1,2})/(\\d{1,2})(?=\\s)`),
		daysAgo: (m, today) => daysBack(today, Number(m[2]) - 1, Number(m[1])),
	},
	{
		pattern: new RegExp(
			`\\s${ON}(last\\s+)?(${WEEKDAY})(\\s+(?:lepas|lalu))?(?=\\s)`,
			"i",
		),
		daysAgo: (m, today) => {
			const target = indexOf(WEEKDAYS, m[2] ?? "");
			const back = (new Date(toUtc(today)).getUTCDay() - target + 7) % 7;
			return back === 0 && (m[1] || m[3]) ? 7 : back;
		},
	},
];

/**
 * Finds the first earlier-day phrase in `text` (padded with spaces) and removes it.
 * `today` is the person's own calendar day ("YYYY-MM-DD").
 */
export function takePastDay(
	text: string,
	today: string,
): { rest: string; daysAgo: number } {
	for (const rule of RULES) {
		const m = rule.pattern.exec(text);
		if (!m) continue;
		const days = rule.daysAgo(m, today);
		if (days === null || days < 0) continue;
		return {
			rest: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`,
			daysAgo: days,
		};
	}
	return { rest: text, daysAgo: 0 };
}
