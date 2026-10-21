import type { Category } from "@spendid/shared";
import { z } from "zod";
import { type AskContext, localToday } from "./context";
import { PERIODS, periodRange } from "./period";

/** The date part of a read tool: a named period, or both dates. */
export const RangeFields = {
	period: z
		.enum(PERIODS)
		.optional()
		.describe(
			"A named period, worked out for you in the person's days. Prefer this when it fits.",
		),
	lastDays: z
		.number()
		.int()
		.min(1)
		.max(366)
		.optional()
		.describe(
			"The last N days up to and including today, worked out for you: 3 for 'last 3 days'. Use instead of from/to.",
		),
	from: z.string().optional().describe("First day, YYYY-MM-DD (with `to`)"),
	to: z.string().optional().describe("Last day, YYYY-MM-DD, inclusive"),
};

export type RangeInput = {
	period?: (typeof PERIODS)[number];
	lastDays?: number;
	from?: string;
	to?: string;
};

export type Resolved<T> = { ok: T } | { error: string };

function realDate(day: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
	const d = new Date(`${day}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** The exact days asked about, or why they can't be used. */
export function resolveRange(
	input: RangeInput,
	ctx: Pick<AskContext, "timeZone" | "today">,
): Resolved<{ from: string; to: string }> {
	const today = ctx.today ?? localToday(ctx.timeZone);
	if (input.period) return { ok: periodRange(input.period, today) };
	if (input.lastDays) {
		const from = new Date(
			Date.parse(`${today}T00:00:00Z`) - (input.lastDays - 1) * 86_400_000,
		)
			.toISOString()
			.slice(0, 10);
		return { ok: { from, to: today } };
	}
	if (!input.from || !input.to)
		return {
			error:
				"Give a period (like this_month), or both from and to as YYYY-MM-DD.",
		};
	for (const day of [input.from, input.to])
		if (!realDate(day))
			return {
				error: `${day} isn't a real date. Use YYYY-MM-DD, like 2025-03-31.`,
			};
	if (input.from > input.to)
		return {
			error: `The start date (${input.from}) is after the end date (${input.to}).`,
		};
	return { ok: { from: input.from, to: input.to } };
}

const norm = (s: string) =>
	s.trim().toLowerCase().replace(/\s+/g, " ").replace(/&/g, "and");

/** The app's Malay names for the built-in categories, so questions in Malay are understood. */
const MS_NAMES: Record<string, string> = {
	food: "Makan di luar",
	groceries: "Barang dapur",
	transport: "Pengangkutan",
	car: "Kereta & minyak",
	phone: "Telefon & internet",
	bills: "Bil & utiliti",
	home: "Rumah & sewa",
	household: "Rumah tangga & pembaikan",
	shopping: "Membeli-belah",
	gadgets: "Gajet & elektronik",
	health: "Kesihatan",
	fitness: "Sukan & kecergasan",
	insurance: "Insurans & takaful",
	loans: "Pinjaman & hutang",
	fun: "Hiburan",
	subscriptions: "Langganan",
	travel: "Percutian",
	education: "Pendidikan",
	family: "Keluarga & anak",
	pets: "Haiwan peliharaan",
	gifts: "Hadiah",
	charity: "Zakat & derma",
	care: "Penjagaan diri",
	taxes: "Cukai & yuran",
	savings: "Simpanan & pelaburan",
	other: "Lain-lain",
};

/**
 * Every way a category is named: slug, English and Malay names, and each part of a name like
 * "Bills & utilities", lower-case.
 */
export function categoryNames(c: Category): string[] {
	const full = [c.name, MS_NAMES[c.slug]].filter((n): n is string => !!n);
	return [
		...new Set(
			[c.slug, ...full, ...full.flatMap((n) => n.split(/\s*&\s*/))].map(norm),
		),
	];
}

/** The word and its usual singular/plural forms ("grocery" ↔ "groceries", "tax" ↔ "taxes"). */
export function forms(word: string): string[] {
	return [
		word,
		`${word}s`,
		`${word}es`,
		word.replace(/y$/, "ies"),
		word.replace(/ies$/, "y"),
		word.replace(/es$/, ""),
		word.replace(/s$/, ""),
	];
}

/**
 * The category a word names: its slug or display name (or part of a name like "Bills &
 * utilities"), forgiving case and plurals. Anything else is refused, so a word like "coffee"
 * never quietly becomes a whole category, or a total of zero.
 */
export function resolveCategory(
	word: string,
	categories: Category[],
): Resolved<Category> {
	const wanted = new Set(forms(norm(word)));
	const found = categories.find((c) =>
		categoryNames(c).some((n) => wanted.has(n)),
	);
	if (found) return { ok: found };
	return {
		error: `"${word}" isn't a category. Categories: ${categories.map((c) => `${c.slug} (${c.name})`).join(", ")}. To look for a shop or item instead, use search.`,
	};
}
