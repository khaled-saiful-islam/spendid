import {
	type Category,
	minorDigits,
	parseQuickEntry,
	type Transaction,
	toMinor,
} from "@spendid/shared";

export type Day = "today" | "yesterday" | string;

export interface Draft {
	amountText: string;
	currency: string;
	merchant: string;
	categoryId: string;
	day: Day;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date "YYYY-MM-DD". */
export function localDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/** When it happened: now for today, midday for other days (avoids time-zone edge flips). */
export function draftOccurredAt(day: Day): string {
	const now = new Date();
	if (day === "today") return now.toISOString();
	const date =
		day === "yesterday"
			? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
			: new Date(`${day}T00:00`);
	date.setHours(12, 0, 0, 0);
	return date.toISOString();
}
