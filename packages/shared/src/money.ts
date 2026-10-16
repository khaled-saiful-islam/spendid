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
