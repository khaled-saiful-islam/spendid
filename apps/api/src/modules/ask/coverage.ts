import {
	type BudgetMethod,
	type Category,
	SYSTEM_CATEGORIES,
} from "@spendid/shared";
import { categoryNames, forms } from "./tools/filters";
import { type Period, periodRange } from "./tools/period";

/**
 * The second half of the red line: the numbers must be for what was asked. The question's
 * period and categories are read here, in code, and checked against what the tools looked up.
 */

/** What one tool call looked at. `list` is a list of expenses rather than a total. */
export interface Lookup {
	from: string;
	to: string;
	groupBy: "category" | "merchant" | "day" | "week" | "month" | "list";
	/** Only this category; absent means all spending. */
	categoryId?: string;
	/** For lists: their order, and whether every match is in it. */
	sort?: "newest" | "biggest" | "smallest";
	complete?: boolean;
}

/** In list order, so "this month vs last month" reads naturally. */
const PERIOD_WORDS: [Period, RegExp][] = [
	["today", /\btoday\b|\bhari\s+ini\b|\bharini\b/i],
	["yesterday", /\byesterday\b|\bsemalam\b/i],
	["this_week", /\bthis\s+week\b|\bminggu\s+ini\b/i],
	["last_week", /\b(?:last|previous)\s+week\b|\bminggu\s+(?:lepas|lalu)\b/i],
	["this_month", /\bthis\s+month\b|\bbulan\s+ini\b/i],
	["last_month", /\b(?:last|previous)\s+month\b|\bbulan\s+(?:lepas|lalu)\b/i],
	["this_year", /\bthis\s+year\b|\btahun\s+ini\b/i],
	["last_year", /\b(?:last|previous)\s+year\b|\btahun\s+(?:lepas|lalu)\b/i],
	[
		"last_7_days",
		/\b(?:last|past|previous)\s+(?:7|seven)\s+days\b|\b7\s+hari\s+(?:lepas|lalu|terakhir)\b/i,
	],
	[
		"last_30_days",
		/\b(?:last|past|previous)\s+(?:30|thirty)\s+days\b|\b30\s+hari\s+(?:lepas|lalu|terakhir)\b/i,
	],
];

const PERIOD_LABEL: Record<Period, string> = {
	today: "today",
	yesterday: "yesterday",
	this_week: "this week",
	last_week: "last week",
	this_month: "this month",
	last_month: "last month",
	this_year: "this year",
	last_year: "last year",
	last_7_days: "the last 7 days",
	last_30_days: "the last 30 days",
};

/** How finely a longer lookup must be broken down to read a period off it. */
const GRAINS: Record<Period, Lookup["groupBy"][]> = {
	today: ["day"],
	yesterday: ["day"],
	this_week: ["day", "week"],
	last_week: ["day", "week"],
	this_month: ["day", "month"],
	last_month: ["day", "month"],
	this_year: ["day", "month"],
	last_year: ["day", "month"],
	last_7_days: ["day"],
	last_30_days: ["day"],
};

/** Everyday words for a category beyond its names ("eat out", "kopi"), from the shared list. */
const EXTRA_WORDS: Record<string, string[]> = {
	food: [
		"eat out",
		"ate out",
		"eating out",
		"makan luar",
		"restaurants",
		"meals",
	],
};
const KEYWORDS = new Map(
	SYSTEM_CATEGORIES.map((c) => [
		c.slug,
		[...c.keywords, ...(EXTRA_WORDS[c.slug] ?? [])],
	]),
);

/** "Biggest expense" needs the expenses sorted by size, or all of them. */
const SUPERLATIVE = {
	biggest:
		/\b(?:biggest|largest|most expensive|highest|top)\b|\b(?:terbesar|paling mahal|tertinggi)\b/i,
	smallest:
		/\b(?:smallest|cheapest|lowest|least expensive)\b|\b(?:terkecil|paling murah|terendah)\b/i,
};
/** ...unless it's the biggest category or shop, which a breakdown answers. */
const GROUPS =
	/\b(?:categor\w*|kategori|shops?|merchants?|stores?|places?|kedai)\b/i;

/** Words too common to mean a category ("anything other than that"). */
const TOO_COMMON = new Set(["other", "lain-lain"]);

const SPENDING =
	/\b(?:spend|spent|spending|spends|cost|costs|expenses?|paid|pay|belanja|berbelanja|perbelanjaan|habis|bayar)\b/i;

export function mentionedPeriods(question: string): Period[] {
	return PERIOD_WORDS.filter(([, words]) => words.test(question)).map(
		([p]) => p,
	);
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Categories the question names, in the order it names them. */
export function mentionedCategories(
	question: string,
	categories: Category[],
): Category[] {
	const text = question.toLowerCase().replace(/&/g, "and");
	const found: { c: Category; at: number }[] = [];
	for (const c of categories) {
		const words = categoryNames(c)
			.filter((n) => !TOO_COMMON.has(n))
			.flatMap((n) => (n.includes(" ") ? [n] : forms(n)))
			.filter((w) => w.length >= 3);
		let at = -1;
		for (const w of new Set(words)) {
			const m = new RegExp(
				`(?<![\\p{L}-])${escapeRegex(w)}(?![\\p{L}-])`,
				"iu",
			).exec(text);
			if (m && (at < 0 || m.index < at)) at = m.index;
		}
		if (at >= 0) found.push({ c, at });
	}
	return found.sort((a, b) => a.at - b.at).map((f) => f.c);
}

/** Days a question is about: how to name them, how to look them up, and how finely. */
interface Span {
	label: string;
	use: string;
	from: string;
	to: string;
	grains: Lookup["groupBy"][];
}

function covers(l: Lookup, t: Span): boolean {
	if (l.from === t.from && l.to === t.to) return true;
	return t.grains.includes(l.groupBy) && l.from <= t.from && l.to >= t.to;
}

const NUMBER_WORDS: Record<string, number> = {
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	dua: 2,
	tiga: 3,
	empat: 4,
	lima: 5,
	enam: 6,
	tujuh: 7,
	lapan: 8,
	sembilan: 9,
	sepuluh: 10,
};
const COUNT = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join("|")})`;
const LAST_DAYS = [
	new RegExp(`\\b(?:last|past|previous)\\s+${COUNT}\\s+days?\\b`, "gi"),
	new RegExp(`\\b${COUNT}\\s+hari\\s+(?:lepas|lalu|terakhir)\\b`, "gi"),
];

/** "last 3 days", "past five days", "3 hari lepas": N days up to and including today. */
export function mentionedLastDays(question: string): number[] {
	const found = LAST_DAYS.flatMap((re) =>
		[...question.matchAll(re)].map((m) => {
			const word = (m[1] ?? "").toLowerCase();
			return NUMBER_WORDS[word] ?? Number(word);
		}),
	);
	return [...new Set(found)].filter((n) => n >= 1 && n <= 366);
}

/** The periods and "last N days" a question names, as spans of days. */
function spansIn(question: string, today: string): Span[] {
	const spans: Span[] = mentionedPeriods(question).map((period) => ({
		label: PERIOD_LABEL[period],
		use: `period ${period}`,
		...periodRange(period, today),
		grains: GRAINS[period],
	}));
	for (const n of mentionedLastDays(question)) {
		const from = new Date(
			Date.parse(`${today}T00:00:00Z`) - (n - 1) * 86_400_000,
		)
			.toISOString()
			.slice(0, 10);
		if (!spans.some((s) => s.from === from && s.to === today))
			spans.push({
				label: `the last ${n} days`,
				use: `lastDays ${n} with groupBy day`,
				from,
				to: today,
				grains: ["day"],
			});
	}
	return spans;
}

/** Categories the question hints at with everyday words, without naming them. */
function impliedCategoryIds(
	question: string,
	categories: Category[],
): Set<string> {
	const text = question.toLowerCase();
	return new Set(
		categories
			.filter((c) =>
				(KEYWORDS.get(c.slug) ?? []).some((w) =>
					new RegExp(`(?<![\\p{L}])${escapeRegex(w)}(?![\\p{L}])`, "iu").test(
						text,
					),
				),
			)
			.map((c) => c.id),
	);
}

const coversCategory = (l: Lookup, c: Category) =>
	l.categoryId === c.id || (!l.categoryId && l.groupBy === "category");

/** "Biggest expense" read off the newest few is a wrong answer that looks right. */
function superlativeProblems(
	question: string,
	periods: Span[],
	lookups: Lookup[],
): string[] {
	if (GROUPS.test(question)) return [];
	const want = SUPERLATIVE.biggest.test(question)
		? "biggest"
		: SUPERLATIVE.smallest.test(question)
			? "smallest"
			: null;
	if (!want) return [];
	const fits = (l: Lookup) =>
		l.groupBy === "list" &&
		(l.complete || l.sort === want) &&
		(periods.length === 0 || periods.some((t) => covers(l, t)));
	return lookups.some(fits)
		? []
		: [
				`The question asks for the ${want} expense, but no list was sorted that way or held every match. Use find_expenses with sort "${want}".`,
			];
}

/** Monthly transfers (pay yourself first) live in the plan, never in spending. EN + BM. */
const TRANSFERS =
	/(^|[^\p{L}])(transfers?|transferring|transferred|pay yourself first|pindahan|pindah|dipindahkan)(?=$|[^\p{L}])/iu;

/** What's wrong with the lookups for this question; empty when they fit what was asked. */
export function coverageProblems(input: {
	question: string;
	today: string;
	categories: Category[];
	lookups: Lookup[];
	/** budget_overview was called for this question. */
	planRead?: boolean;
}): string[] {
	const plan =
		TRANSFERS.test(input.question) && !input.planRead
			? [
					"The question is about monthly transfers, which are part of the plan, not spending. Call budget_overview and answer from monthlyTransfersOutFirst, monthlyTransfersTotal and incomeLeftAfterTransfers (or say the plan has none).",
				]
			: [];
	return [...plan, ...spendingCoverage(input)];
}

function spendingCoverage(input: {
	question: string;
	today: string;
	categories: Category[];
	lookups: Lookup[];
}): string[] {
	const periods = spansIn(input.question, input.today);
	const cats = mentionedCategories(input.question, input.categories);
	const { lookups } = input;
	const span = (t: Span) => `${t.label} (${t.from} to ${t.to})`;

	if (lookups.length === 0)
		return SPENDING.test(input.question) && (periods.length || cats.length)
			? [
					`Nothing was looked up for this question. Use spending_totals for ${[...periods.map(span), ...cats.map((c) => c.name)].join(" and ")} before answering.`,
				]
			: [];

	const problems: string[] = [
		...superlativeProblems(input.question, periods, lookups),
	];
	if (cats.length === 0) {
		// All spending, or a category the question hints at ("eat out" is Eating out).
		const implied = impliedCategoryIds(input.question, input.categories);
		for (const t of periods)
			if (
				!lookups.some(
					(l) => (!l.categoryId || implied.has(l.categoryId)) && covers(l, t),
				)
			)
				problems.push(
					`The question is about ${span(t)}, but no lookup of all spending covered exactly those days. Use ${t.use}.`,
				);
		return problems;
	}
	for (const c of cats) {
		if (periods.length === 0) {
			if (!lookups.some((l) => coversCategory(l, c)))
				problems.push(
					`The question asks about ${c.name}, but nothing looked up ${c.name}. Use spending_totals with category ${c.slug}.`,
				);
			continue;
		}
		for (const t of periods)
			if (!lookups.some((l) => coversCategory(l, c) && covers(l, t)))
				problems.push(
					`The question asks about ${c.name} for ${span(t)}, but no lookup covered ${c.name} for exactly those days. Use spending_totals with category ${c.slug} and ${t.use}.`,
				);
	}
	return problems;
}

/** Each plan's name in English and Malay, as the app shows it. */
const PLAN_NAMES: Record<BudgetMethod, { label: string; re: RegExp }> = {
	fifty_thirty_twenty: { label: "50/30/20", re: /50\s*\/\s*30\s*\/\s*20/ },
	envelope: { label: "envelopes", re: /\benvelopes?\b|\bsampul\b/i },
	zero_based: {
		label: "every bit has a job (zero-based)",
		re: /zero[- ]based|every (bit|ringgit) has a job|setiap ringgit ada tugas/i,
	},
	pay_yourself_first: {
		label: "pay yourself first",
		re: /pay yourself first|bayar diri (sendiri )?dahulu/i,
	},
};

/** Asking for advice or a comparison: other plans may rightly be named. EN + BM. */
const ADVICE =
	/\b(should|recommend|suggest|best|better|options?|alternatives?|compare|versus|vs|switch|change|patut|cadang|sesuai|pilihan|banding|tukar)\b/i;

const plansIn = (text: string) =>
	(Object.keys(PLAN_NAMES) as BudgetMethod[]).filter((m) =>
		PLAN_NAMES[m].re.test(text),
	);

/**
 * An answer must never say someone is on a plan they aren't. Skipped when the question names
 * a plan or asks for advice, where naming other plans is the point.
 */
export function planNameProblems(input: {
	question: string;
	answer: string;
	method: BudgetMethod | null;
}): string[] {
	if (plansIn(input.question).length || ADVICE.test(input.question)) return [];
	const wrong = plansIn(input.answer).filter((m) => m !== input.method);
	if (wrong.length === 0) return [];
	const actual = input.method
		? PLAN_NAMES[input.method].label
		: "none (no plan chosen yet)";
	return [
		`The answer names ${wrong.map((m) => PLAN_NAMES[m].label).join(" and ")}, but the person's plan is ${actual}. Name only the plan budget_overview gives.`,
	];
}
