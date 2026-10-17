import {
	type Category,
	minorDigits,
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
	const parsed = parseQuickEntry(text);
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
		day:
			parsed.daysAgo === 1
				? "yesterday"
				: draft.day === "yesterday"
					? "today"
					: draft.day,
	};
}

/** Parsed amount in minor units, or null when it isn't a positive number. */
export function draftMinor(draft: Draft): number | null {
	const n = Number(draft.amountText.replace(",", "."));
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
