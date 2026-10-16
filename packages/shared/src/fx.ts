import { minorDigits } from "./money";

export interface Conversion {
	homeMinor: number;
	/** Home units per 1 unit of the source currency. */
	rate: number;
}

/**
 * Converts minor units between currencies using EUR-based reference rates
 * (`perEur` = how many units of that currency one euro buys).
 */
export function convertMinor(input: {
	amountMinor: number;
	from: string;
	to: string;
	fromPerEur: number;
	toPerEur: number;
}): Conversion {
	if (input.from === input.to) return { homeMinor: input.amountMinor, rate: 1 };
	const rate = input.toPerEur / input.fromPerEur;
	const major = input.amountMinor / 10 ** minorDigits(input.from);
	return {
		homeMinor: Math.round(major * rate * 10 ** minorDigits(input.to)),
		rate,
	};
}
