import {
	formatMinor,
	minorDigits,
	type Transfer,
	type TransferInput,
	toMinor,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/http";
import { moneyApi, refreshMoney, transfersQuery } from "@/lib/money-api";

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
const blankDraft = (): TransferDraft => ({
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
		const n = Number(amount.replace(",", "."));
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
		const n = Number(d.amount.replace(",", "."));
		return n > 0 ? sum + toMinor(n, cur) : sum;
	}, 0);
}

interface EditorProps {
	currency: string;
	drafts: TransferDraft[];
	onChange: (drafts: TransferDraft[]) => void;
}

/** Name + amount rows for what goes out when salary lands. Controlled. */
export function TransfersEditor({ currency, drafts, onChange }: EditorProps) {
	const reduce = useReducedMotion();
	const rows = drafts.length > 0 ? drafts : [blankDraft()];
	const update = (key: string, patch: Partial<TransferDraft>) =>
		onChange(rows.map((d) => (d.key === key ? { ...d, ...patch } : d)));

	return (
		<div className="space-y-2">
			<ul className="space-y-2">
				<AnimatePresence initial={false}>
					{rows.map((d, i) => (
						<motion.li
							key={d.key}
							layout={!reduce}
							initial={reduce ? false : { opacity: 0, y: -6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
							className="flex items-center gap-2"
						>
							<span
								className={cn("size-3 shrink-0 rounded-full", transferFill(i))}
								aria-hidden="true"
							/>
							<input
								value={d.name}
								maxLength={40}
								onChange={(e) => update(d.key, { name: e.target.value })}
								placeholder={t("e.g. Savings, Mum, ASB")}
								aria-label={t("Transfer {n} name", { n: i + 1 })}
								className="h-11 w-0 min-w-0 flex-[3] rounded-full border-2 border-line bg-bg px-4 outline-none focus:border-plum-500"
							/>
							<input
								value={d.amount}
								inputMode="decimal"
								onChange={(e) =>
									update(d.key, {
										amount: e.target.value.replace(/[^\d.,]/g, ""),
									})
								}
								placeholder={t("Amount")}
								aria-label={t("Transfer {n} amount in {currency}", {
									n: i + 1,
									currency,
								})}
								className="num h-11 w-0 min-w-0 flex-[2] rounded-full border-2 border-line bg-bg px-4 outline-none focus:border-plum-500"
							/>
							<button
								type="button"
								onClick={() => onChange(rows.filter((x) => x.key !== d.key))}
								aria-label={t("Remove transfer {n}", { n: i + 1 })}
								className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
							>
								<X className="size-4" aria-hidden="true" />
							</button>
						</motion.li>
					))}
				</AnimatePresence>
			</ul>
			{rows.length < 12 && (
				<button
					type="button"
					onClick={() => onChange([...rows, blankDraft()])}
					className="inline-flex h-11 items-center gap-2 rounded-full px-3 font-semibold text-plum-500 hover:bg-surface-2"
				>
					<Plus className="size-4" aria-hidden="true" />
					{t("Add a transfer")}
				</button>
			)}
		</div>
	);
}

/** Plan page, pay yourself first: the saved list, editable in place. */
export function TransfersSection({
	currency,
	incomeMinor,
}: {
	currency: string;
	incomeMinor: number;
}) {
	const queryClient = useQueryClient();
	const { data: saved } = useQuery(transfersQuery);
	const [drafts, setDrafts] = useState<TransferDraft[] | null>(null);
	const [error, setError] = useState<string>();
	const [pending, setPending] = useState(false);
	const [done, setDone] = useState(false);
	const rows = drafts ?? toDrafts(saved ?? [], currency);
	const total = draftsTotal(rows, currency);
	const left = incomeMinor - total;

	async function save() {
		const read = readDrafts(rows, currency);
		if ("error" in read) return setError(read.error);
		setError(undefined);
		setPending(true);
		try {
			await moneyApi.setTransfers(read.list);
			await refreshMoney(queryClient);
			setDrafts(null);
			setDone(true);
		} catch (e) {
			setError(
				e instanceof ApiError ? e.message : t("Couldn't save. Try again."),
			);
		} finally {
			setPending(false);
		}
	}

	return (
		<section aria-labelledby="transfers-heading" className="space-y-3">
			<SectionHeader
				id="transfers-heading"
				title={t("Your transfers")}
				icon={ArrowUpRight}
				tint="amber"
				sub={t("What goes out each month when salary lands")}
			/>
			<form
				className="space-y-3 rounded-panel border border-line bg-surface p-3 sm:p-4"
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<TransfersEditor
					currency={currency}
					drafts={rows}
					onChange={(next) => {
						setDrafts(next);
						setDone(false);
					}}
				/>
				<dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
					<div>
						<dt className="text-[0.85rem] text-ink-soft">
							{t("Transfers each month")}
						</dt>
						<dd data-money className="num text-[1.1rem] font-bold">
							{formatMinor(total, currency)}
						</dd>
					</div>
					<div>
						<dt className="text-[0.85rem] text-ink-soft">
							{t("Left for spending")}
						</dt>
						<dd
							data-money
							className={cn(
								"num text-[1.1rem] font-bold",
								left < 0 ? "text-coral" : "text-safe",
							)}
						>
							{formatMinor(left, currency)}
						</dd>
					</div>
				</dl>
				{left < 0 && (
					<p className="text-[0.9rem] text-coral">
						{t("Your transfers are more than your income.")}
					</p>
				)}
				<MaybeAlert tone="error" message={error} />
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="submit"
						disabled={pending || drafts === null}
						className="h-11 rounded-full bg-plum-900 px-5 font-semibold text-plum-50 disabled:opacity-50 dark:bg-plum-50 dark:text-plum-900"
					>
						{pending ? t("Saving…") : t("Save transfers")}
					</button>
					{done && drafts === null && (
						<span role="status" className="text-[0.9rem] text-safe">
							{t("Saved. Safe to spend is updated.")}
						</span>
					)}
				</div>
			</form>
		</section>
	);
}
