import type { BudgetMethod } from "@spendid/shared";

const POPULAR = [
	"MYR",
	"SGD",
	"USD",
	"EUR",
	"GBP",
	"IDR",
	"THB",
	"PHP",
	"INR",
	"AUD",
	"JPY",
	"BDT",
];

export interface CurrencyOption {
	code: string;
	label: string;
}

/** Popular currencies first, then every other ISO currency by name. */
export function currencyOptions(locale: string): {
	popular: CurrencyOption[];
	rest: CurrencyOption[];
} {
	const names = new Intl.DisplayNames([locale], { type: "currency" });
	const toOption = (code: string): CurrencyOption => ({
		code,
		label: `${names.of(code) ?? code} (${code})`,
	});
	const rest = Intl.supportedValuesOf("currency")
		.filter((c) => !POPULAR.includes(c))
		.map(toOption)
		.sort((a, b) => a.label.localeCompare(b.label));
	return { popular: POPULAR.map(toOption), rest };
}

/** Narrow symbol for an input prefix: "RM", "$", "€". */
export function currencySymbol(code: string, locale?: string): string {
	return (
		new Intl.NumberFormat(locale, {
			style: "currency",
			currency: code,
			currencyDisplay: "narrowSymbol",
		})
			.formatToParts(0)
			.find((p) => p.type === "currency")?.value ?? code
	);
}

export interface MethodOption {
	id: BudgetMethod;
	title: string;
	body: string;
	bars: { share: number; color: string; label: string }[];
}

export const METHODS: MethodOption[] = [
	{
		id: "fifty_thirty_twenty",
		title: "50 / 30 / 20",
		body: "Half for needs, some for fun, the rest saved. Simple and a great place to start.",
		bars: [
			{ share: 50, color: "bg-jade", label: "Needs 50%" },
			{ share: 30, color: "bg-sky", label: "Wants 30%" },
			{ share: 20, color: "bg-marigold", label: "Savings 20%" },
		],
	},
	{
		id: "envelope",
		title: "Envelopes",
		body: "Set an amount for each category. When an envelope is empty, that spending waits.",
		bars: [
			{ share: 30, color: "bg-orange-400", label: "Food" },
			{ share: 25, color: "bg-sky", label: "Transport" },
			{ share: 25, color: "bg-pink-400", label: "Shopping" },
			{ share: 20, color: "bg-plum-300", label: "Other" },
		],
	},
	{
		id: "zero_based",
		title: "Every bit has a job",
		body: "Plan where all of your income goes before the month starts, down to zero left over.",
		bars: [
			{ share: 35, color: "bg-jade", label: "Bills" },
			{ share: 20, color: "bg-orange-400", label: "Food" },
			{ share: 15, color: "bg-sky", label: "Travel" },
			{ share: 30, color: "bg-marigold", label: "Goals" },
		],
	},
];
