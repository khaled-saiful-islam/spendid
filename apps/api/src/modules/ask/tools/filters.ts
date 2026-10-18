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
	from: z.string().optional().describe("First day, YYYY-MM-DD (with `to`)"),
	to: z.string().optional().describe("Last day, YYYY-MM-DD, inclusive"),
};

export type RangeInput = {
	period?: (typeof PERIODS)[number];
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
	if (input.period)
		return {
			ok: periodRange(input.period, ctx.today ?? localToday(ctx.timeZone)),
		};
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

/** The word and its usual singular/plural forms ("grocery" ↔ "groceries", "tax" ↔ "taxes"). */
function forms(word: string): string[] {
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
	const found = categories.find((c) => {
		const names = [c.slug, c.name, ...c.name.split(/\s*&\s*/)].map(norm);
		return names.some((n) => wanted.has(n));
	});
	if (found) return { ok: found };
	return {
		error: `"${word}" isn't a category. Categories: ${categories.map((c) => `${c.slug} (${c.name})`).join(", ")}. To look for a shop or item instead, use search.`,
	};
}
