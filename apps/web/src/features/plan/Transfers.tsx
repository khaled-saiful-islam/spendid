import { formatMinor } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus, X } from "lucide-react";
import {
	AnimatePresence,
	motion,
	useIsPresent,
	useReducedMotion,
} from "motion/react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/http";
import { moneyApi, refreshMoney, transfersQuery } from "@/lib/money-api";
import {
	blankDraft,
	draftsTotal,
	readDrafts,
	type TransferDraft,
	toDrafts,
	transferFill,
} from "./transfer-drafts";

interface EditorProps {
	currency: string;
	drafts: TransferDraft[];
	onChange: (drafts: TransferDraft[]) => void;
}

interface RowProps {
	draft: TransferDraft;
	index: number;
	currency: string;
	onUpdate: (patch: Partial<TransferDraft>) => void;
	onRemove: () => void;
}

/** One transfer. While it animates out it is hidden from screen readers and focus. */
function TransferRow({ draft, index, currency, onUpdate, onRemove }: RowProps) {
	const reduce = useReducedMotion();
	const present = useIsPresent();
	const n = index + 1;
	return (
		<motion.li
			layout={!reduce}
			initial={reduce ? false : { opacity: 0, y: -6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
			aria-hidden={present ? undefined : true}
			inert={!present}
			className="flex items-center gap-2"
		>
			<span
				className={cn("size-3 shrink-0 rounded-full", transferFill(index))}
				aria-hidden="true"
			/>
			<input
				value={draft.name}
				maxLength={40}
				onChange={(e) => onUpdate({ name: e.target.value })}
				placeholder={t("e.g. Savings, Mum, ASB")}
				aria-label={t("Transfer {n} name", { n })}
				className="h-11 w-0 min-w-0 flex-[3] rounded-full border-2 border-line bg-bg px-4 outline-none focus:border-plum-500"
			/>
			<input
				value={draft.amount}
				inputMode="decimal"
				onChange={(e) =>
					onUpdate({ amount: e.target.value.replace(/[^\d.,]/g, "") })
				}
				placeholder={t("Amount")}
				aria-label={t("Transfer {n} amount in {currency}", { n, currency })}
				className="num h-11 w-0 min-w-0 flex-[2] rounded-full border-2 border-line bg-bg px-4 outline-none focus:border-plum-500"
			/>
			<button
				type="button"
				onClick={onRemove}
				aria-label={t("Remove transfer {n}", { n })}
				className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
			>
				<X className="size-4" aria-hidden="true" />
			</button>
		</motion.li>
	);
}

/** Name + amount rows for what goes out when salary lands. Controlled. */
export function TransfersEditor({ currency, drafts, onChange }: EditorProps) {
	// One stable empty row when there are none, so it isn't re-created on every render.
	const [blank] = useState(blankDraft);
	const rows = drafts.length > 0 ? drafts : [blank];
	const update = (key: string, patch: Partial<TransferDraft>) =>
		onChange(rows.map((d) => (d.key === key ? { ...d, ...patch } : d)));

	return (
		<div className="space-y-2">
			<ul className="space-y-2">
				<AnimatePresence initial={false}>
					{rows.map((d, i) => (
						<TransferRow
							key={d.key}
							draft={d}
							index={i}
							currency={currency}
							onUpdate={(patch) => update(d.key, patch)}
							onRemove={() => onChange(rows.filter((x) => x.key !== d.key))}
						/>
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

/** While the saved list loads, or if it can't: never an editor that could save over it. */
export function TransfersLoading({
	failed,
	onRetry,
}: {
	failed: boolean;
	onRetry: () => void;
}) {
	return failed ? (
		<div className="space-y-2">
			<MaybeAlert tone="error" message={t("Couldn't load your transfers.")} />
			<button
				type="button"
				onClick={onRetry}
				className="h-11 rounded-full px-4 font-semibold text-plum-500 hover:bg-surface-2"
			>
				{t("Try again")}
			</button>
		</div>
	) : (
		<div
			className="h-11 animate-pulse rounded-full bg-surface-2"
			role="status"
			aria-label={t("Loading your transfers")}
		/>
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
	const { data: saved, isError, refetch } = useQuery(transfersQuery);
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
			{saved === undefined ? (
				<div className="rounded-panel border border-line bg-surface p-3 sm:p-4">
					<TransfersLoading failed={isError} onRetry={() => void refetch()} />
				</div>
			) : (
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
									left < 0 ? "text-over" : "text-safe",
								)}
							>
								{formatMinor(left, currency)}
							</dd>
						</div>
					</dl>
					{left < 0 && (
						<p className="text-[0.9rem] text-over">
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
			)}
		</section>
	);
}
