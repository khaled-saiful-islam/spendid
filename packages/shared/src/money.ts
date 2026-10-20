/**
 * Money is always stored as integer minor units (sen, cents, yen) plus an ISO 4217 code.
 * Never store or add floats — convert at the edges with these helpers.
 */

const NBSP = String.fromCharCode(160);

/** Number of decimal places a currency uses (MYR 2, JPY 0, KWD 3). */
export function minorDigits(currency: string): number {
	return new Intl.NumberFormat("en", {
		style: "currency",
		currency,
	}).resolvedOptions().maximumFractionDigits as number;
}

const PLAIN = /^(\d+(\.\d+)?|\.\d+)$/;
const THOUSANDS = /^\d{1,3}(,\d{3})+(\.\d+)?$/;
const DECIMAL_COMMA = /^\d+,\d{1,2}$/;

/**
 * What someone typed in an amount box → a number. "4,500" is four thousand five hundred (how
 * Malaysia writes it); "12,50" is twelve and a half (a decimal comma). Anything else that
 * would need a guess is NaN, so the form says so instead of saving a wrong amount. Blank is 0.
 */
export function parseAmount(text: string): number {
	const v = text.trim();
	if (v === "") return 0;
	if (PLAIN.test(v)) return Number(v);
	if (THOUSANDS.test(v)) return Number(v.replaceAll(",", ""));
	if (DECIMAL_COMMA.test(v)) return Number(v.replace(",", "."));
	return Number.NaN;
}

/** Typed major amount (12.3) → integer minor units (1230). */
export function toMinor(major: number, currency: string): number {
	return Math.round(major * 10 ** minorDigits(currency));
}

/** Integer minor units → localised display string ("RM 48.20"). */
export function formatMinor(
	minor: number,
	currency: string,
	locale?: string,
): string {
	const digits = minorDigits(currency);
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		currencyDisplay: "narrowSymbol",
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	})
		.format(minor / 10 ** digits)
		.replaceAll(NBSP, " ");
}
