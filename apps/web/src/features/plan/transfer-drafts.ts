import {
	minorDigits,
	parseAmount,
	type Transfer,
	type TransferInput,
	toMinor,
} from "@spendid/shared";
import { t } from "@/i18n";

/** One row while it's being typed. */
export interface TransferDraft {
	key: string;
	name: string;
	amount: string;
}

/** Colours for transfers in bars and dots, in list order (jade is "to spend"). */
export const TRANSFER_FILLS = [
	"bg-marigold",
	"bg-orange-400",
	"bg-pink-400",
	"bg-sky",
	"bg-plum-300",
];
export const transferFill = (i: number) =>
	TRANSFER_FILLS[i % TRANSFER_FILLS.length] ?? "bg-marigold";

let nextKey = 0;
export const blankDraft = (): TransferDraft => ({
	key: `new-${nextKey++}`,
	name: "",
	amount: "",
});

export function toDrafts(list: Transfer[], cur: string): TransferDraft[] {
	return list.map((x) => ({
		key: x.id,
		name: x.name,
		amount: String(x.amountMinor / 10 ** minorDigits(cur)),
	}));
}

/**
 * The rows that are filled in, ready to save. A row with only a name or only an amount is an
 * error rather than silently dropped; fully empty rows are ignored.
 */
export function readDrafts(
	drafts: TransferDraft[],
	cur: string,
): { list: TransferInput[] } | { error: string } {
	const list: TransferInput[] = [];
	for (const d of drafts) {
		const name = d.name.trim();
		const amount = d.amount.trim();
		if (!name && !amount) continue;
		const n = parseAmount(amount);
		if (!name) return { error: t("Name each transfer.") };
		if (!amount || Number.isNaN(n) || n <= 0)
			return {
				error: t("Set an amount above zero for {name}.", { name }),
			};
		list.push({ name, amountMinor: toMinor(n, cur) });
	}
	return { list };
}

/** Sum of the rows that have a valid amount, for live totals while typing. */
export function draftsTotal(drafts: TransferDraft[], cur: string): number {
	return drafts.reduce((sum, d) => {
		const n = parseAmount(d.amount);
		return n > 0 ? sum + toMinor(n, cur) : sum;
	}, 0);
}
