import {
	type Category,
	minorDigits,
	parseAmount,
	parseQuickEntry,
	type Transaction,
	toMinor,
} from "@spendid/shared";
import { addDays, appDayOf, appToday, momentOnDay } from "@/lib/time";

export type Day = "today" | "yesterday" | string;

export interface Draft {
	amountText: string;
	currency: string;
	merchant: string;
	categoryId: string;
	day: Day;
	/** The day came from words typed in the shorthand ("monday"), so deleting them resets it. */
	dayTyped?: boolean;
}

/** The calendar date "YYYY-MM-DD" of a moment, in the app's time zone. */
export function localDate(d: Date): string {
	return appDayOf(d);
}

export function emptyDraft(homeCurrency: string): Draft {
	return {
		amountText: "",
		currency: homeCurrency,
		merchant: "",
		categoryId: "",
		day: "today",
	};
}

export function draftFrom(t: Transaction): Draft {
	const digits = minorDigits(t.currency);
	const day = localDate(new Date(t.occurredAt));
	return {
		amountText: (t.amountMinor / 10 ** digits).toFixed(digits),
		currency: t.currency,
		merchant: t.merchant ?? "",
		categoryId: t.categoryId,
		day: day === localDate(new Date()) ? "today" : day,
	};
}

/** Applies typed shorthand to the draft. A category the person picked by hand is kept. */
export function applyShorthand(
	draft: Draft,
	text: string,
	categories: Category[],
	pickedByHand: boolean,
): Draft {
	const today = appToday();
	const parsed = parseQuickEntry(text, today);
	const guessed = parsed.categorySlug
		? categories.find((c) => c.slug === parsed.categorySlug)
		: undefined;
	return {
		...draft,
		amountText:
			parsed.amount === null
				? draft.amountText
				: parsed.amount.toFixed(minorDigits(parsed.currency ?? draft.currency)),
		currency: parsed.currency ?? draft.currency,
		merchant: parsed.description,
		categoryId: !pickedByHand && guessed ? guessed.id : draft.categoryId,
		...dayFromWords(draft, parsed.daysAgo, today),
	};
}

/** The draft's day after the shorthand names `daysAgo` (0 when it names no day). */
function dayFromWords(
	draft: Draft,
	daysAgo: number,
	today: string,
): Pick<Draft, "day" | "dayTyped"> {
	if (daysAgo === 1) return { day: "yesterday", dayTyped: true };
	if (daysAgo > 1) return { day: addDays(today, -daysAgo), dayTyped: true };
	return draft.dayTyped
		? { day: "today", dayTyped: false }
		: { day: draft.day, dayTyped: false };
}

/** Parsed amount in minor units, or null when it isn't a positive number. */
export function draftMinor(draft: Draft): number | null {
	const n = parseAmount(draft.amountText);
	if (!Number.isFinite(n) || n <= 0) return null;
	return toMinor(n, draft.currency);
}

/** When it happened: now for today, midday (app time zone) for other days. */
export function draftOccurredAt(day: Day): string {
	const today = appToday();
	return momentOnDay(
		day === "today" ? today : day === "yesterday" ? addDays(today, -1) : day,
	);
}
