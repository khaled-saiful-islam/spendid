import {
	formatMinor,
	minorDigits,
	toMinor,
	type VoiceDraft,
	type VoiceResult,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Quote, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { SubmitButton } from "@/components/form/SubmitButton";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { toast } from "@/components/ui/Toast";
import { categoriesQuery, moneyApi, refreshMoney } from "@/lib/money-api";

interface Row extends VoiceDraft {
	key: string;
	amountText: string;
}

function occurredAt(daysAgo: number): string {
	if (daysAgo === 0) return new Date().toISOString();
	const d = new Date();
	d.setDate(d.getDate() - daysAgo);
	d.setHours(12, 0, 0, 0);
	return d.toISOString();
}

const dayLabel = (n: number) =>
	n === 0 ? "Today" : n === 1 ? "Yesterday" : `${n} days ago`;

interface VoiceReviewProps {
	result: VoiceResult;
	/** "Say it again" — omitted when the drafts came from chat. */
	onAgain?: () => void;
	onDone: () => void;
	/** Chat already shows what was asked. */
	hideTranscript?: boolean;
}

/** What we heard, as cards you can fix before saving them all at once. */
export function VoiceReview({
	result,
	onAgain,
	onDone,
	hideTranscript,
}: VoiceReviewProps) {
	const queryClient = useQueryClient();
	const { data: categories = [] } = useQuery(categoriesQuery);
	const [rows, setRows] = useState<Row[]>(() =>
		result.drafts.map((d, i) => ({
			...d,
			key: `${i}-${d.merchant}`,
			amountText: (d.amountMinor / 10 ** minorDigits(d.currency)).toFixed(
				minorDigits(d.currency),
			),
		})),
	);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const update = (key: string, patch: Partial<Row>) =>
		setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
	const valid = rows.filter(
		(r) => Number(r.amountText.replace(",", ".")) > 0 && r.categoryId,
	);

	async function saveAll() {
		setPending(true);
		setError(null);
		try {
			const saved = await Promise.all(
				valid.map((r) =>
					moneyApi.addTransaction({
						amountMinor: toMinor(
							Number(r.amountText.replace(",", ".")),
							r.currency,
						),
						currency: r.currency,
						categoryId: r.categoryId ?? "",
						merchant: r.merchant.trim() || null,
						note: r.note,
						occurredAt: occurredAt(r.daysAgo),
						source: "voice",
					}),
				),
			);
			await refreshMoney(queryClient);
			toast(
				saved.length === 1
					? "Added 1 expense."
					: `Added ${saved.length} expenses.`,
				{
					label: "Undo",
					run: () =>
						void Promise.all(
							saved.map((t) => moneyApi.deleteTransaction(t.id)),
						).then(() => refreshMoney(queryClient)),
				},
			);
			onDone();
		} catch (err) {
			setPending(false);
			setError(
				err instanceof Error ? err.message : "Couldn't save. Try again.",
			);
		}
	}

	return (
		<div className="space-y-4">
			{!hideTranscript && (
				<figure className="flex gap-3 rounded-panel bg-plum-900 p-4 text-plum-50 dark:bg-plum-800">
					<Quote
						className="mt-1 size-5 shrink-0 text-marigold"
						aria-hidden="true"
					/>
					<blockquote className="font-display text-[1.1rem] leading-snug">
						{result.transcript}
					</blockquote>
				</figure>
			)}
			{result.readBy === "quick" && (
				<p className="rounded-tile bg-marigold/15 px-4 py-3 text-[0.92rem]">
					Read without AI this time. Check the amounts and categories.
				</p>
			)}

			{rows.length === 0 ? (
				<p className="rounded-tile border border-dashed border-line p-5 text-center text-ink-soft">
					We heard you, but no amounts. Try saying the price, like "lunch twelve
					fifty".
				</p>
			) : (
				<ul className="space-y-3" aria-label="Expenses heard">
					<AnimatePresence initial={true}>
						{rows.map((r, i) => {
							const cat = categories.find((c) => c.id === r.categoryId);
							return (
								<motion.li
									key={r.key}
									layout
									initial={{ opacity: 0, y: 16, scale: 0.97 }}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									exit={{ opacity: 0, x: 60 }}
									transition={{
										delay: i * 0.08,
										type: "spring",
										stiffness: 300,
										damping: 26,
									}}
									className="rounded-panel border border-line bg-bg p-3"
								>
									<div className="flex items-center gap-3">
										<CategoryIcon icon={cat?.icon} tint={cat?.tint} />
										<input
											aria-label="What was it?"
											value={r.merchant}
											onChange={(e) =>
												update(r.key, { merchant: e.target.value })
											}
											className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
										/>
										<button
											type="button"
											onClick={() =>
												setRows((rs) => rs.filter((x) => x.key !== r.key))
											}
											aria-label={`Remove ${r.merchant}`}
											className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-coral/12 hover:text-over"
										>
											<X className="size-5" />
										</button>
									</div>
									<div className="mt-2 flex flex-wrap items-center gap-2 pl-14">
										<label className="flex h-10 items-center gap-1.5 rounded-full border-2 border-line bg-surface px-3">
											<span className="text-[0.85rem] font-semibold text-ink-soft">
												{r.currency}
											</span>
											<input
												aria-label={`Amount for ${r.merchant}`}
												inputMode="decimal"
												value={r.amountText}
												onChange={(e) =>
													update(r.key, {
														amountText: e.target.value.replace(/[^\d.,]/g, ""),
													})
												}
												className="num w-20 bg-transparent font-bold outline-none"
											/>
										</label>
										<select
											aria-label={`Category for ${r.merchant}`}
											value={r.categoryId ?? ""}
											onChange={(e) =>
												update(r.key, { categoryId: e.target.value })
											}
											className="h-10 rounded-full border-2 border-line bg-surface px-3 text-[0.9rem]"
										>
											{categories.map((c) => (
												<option key={c.id} value={c.id}>
													{c.name}
												</option>
											))}
										</select>
										<span className="text-[0.85rem] text-ink-soft">
											{dayLabel(r.daysAgo)}
										</span>
									</div>
									{r.note && (
										<p className="mt-2 pl-14 text-[0.85rem] text-ink-soft">
											{r.note}
										</p>
									)}
								</motion.li>
							);
						})}
					</AnimatePresence>
				</ul>
			)}

			<MaybeAlert tone="error" message={error} />
			{valid.length > 0 && (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						void saveAll();
					}}
				>
					<SubmitButton pending={pending} pendingLabel="Saving…">
						{valid.length === 1
							? `Add ${formatMinor(toMinor(Number(valid[0]?.amountText.replace(",", ".") ?? 0), valid[0]?.currency ?? "MYR"), valid[0]?.currency ?? "MYR")}`
							: `Add all ${valid.length}`}
					</SubmitButton>
				</form>
			)}
			{onAgain && (
				<button
					type="button"
					onClick={onAgain}
					className="inline-flex h-11 w-full items-center justify-center gap-2 font-medium text-ink-soft hover:text-ink"
				>
					<Mic className="size-4" aria-hidden="true" /> Say it again
				</button>
			)}
		</div>
	);
}
