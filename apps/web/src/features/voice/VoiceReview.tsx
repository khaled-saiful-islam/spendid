import {
	formatMinor,
	minorDigits,
	parseAmount,
	toMinor,
	type VoiceDraft,
	type VoiceResult,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Plus, Quote, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { SubmitButton } from "@/components/form/SubmitButton";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import {
	categoriesQuery,
	moneyApi,
	refreshMoney,
	summaryQuery,
} from "@/lib/money-api";
import { addDays, appToday, formatDay, momentOnDay } from "@/lib/time";
import { uuid } from "@/lib/uuid";

const DAYS_BACK = [0, 1, 2, 3, 4, 5, 6, 7];

interface Row extends VoiceDraft {
	key: string;
	amountText: string;
}

/** Today: right now. An earlier day: noon then (no time was said), in the app's time zone. */
function occurredAt(daysAgo: number): string {
	return momentOnDay(addDays(appToday(), -daysAgo));
}

const dayLabel = (n: number) =>
	n === 0
		? t("Today")
		: n === 1
			? t("Yesterday")
			: n <= 7
				? t("{n} days ago", { n })
				: formatDay(addDays(appToday(), -n), {
						day: "numeric",
						month: "short",
					});

/** The usual choices, plus the row's own day when it was said further back. */
const daysFor = (current: number) =>
	DAYS_BACK.includes(current) ? DAYS_BACK : [...DAYS_BACK, current];

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
	const { data: summary } = useQuery(summaryQuery);
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
	const addMissed = () =>
		setRows((rs) => [
			...rs,
			{
				key: uuid(),
				merchant: "",
				amountText: "",
				amountMinor: 0,
				currency: rs[0]?.currency ?? summary?.homeCurrency ?? "MYR",
				categoryId: categories.find((c) => c.slug === "other")?.id ?? null,
				daysAgo: rs.at(-1)?.daysAgo ?? 0,
				note: null,
			},
		]);
	const valid = rows.filter(
		(r) => parseAmount(r.amountText) > 0 && r.categoryId,
	);

	async function saveAll() {
		setPending(true);
		setError(null);
		try {
			const saved = await Promise.all(
				valid.map((r) =>
					moneyApi.addTransaction({
						amountMinor: toMinor(parseAmount(r.amountText), r.currency),
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
					? t("Added 1 expense.")
					: t("Added {n} expenses.", { n: saved.length }),
				{
					label: t("Undo"),
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
				err instanceof Error ? err.message : t("Couldn't save. Try again."),
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
					{t("Read without AI this time. Check the amounts and categories.")}
				</p>
			)}

			{rows.length === 0 ? (
				<p className="rounded-tile border border-dashed border-line p-5 text-center text-ink-soft">
					{t(
						"We heard you, but no amounts. Try saying the price, like “lunch twelve fifty”, or add it below.",
					)}
				</p>
			) : (
				<ul className="space-y-3" aria-label={t("Expenses heard")}>
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
											aria-label={t("What was it?")}
											placeholder={t("What was it?")}
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
											aria-label={t("Remove {name}", { name: r.merchant })}
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
												aria-label={t("Amount for {name}", {
													name: r.merchant,
												})}
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
											aria-label={t("Category for {name}", {
												name: r.merchant,
											})}
											value={r.categoryId ?? ""}
											onChange={(e) =>
												update(r.key, { categoryId: e.target.value })
											}
											className="h-10 rounded-full border-2 border-line bg-surface px-3 text-[0.9rem]"
										>
											{categories.map((c) => (
												<option key={c.id} value={c.id}>
													{t(c.name)}
												</option>
											))}
										</select>
										<select
											aria-label={t("Day for {name}", { name: r.merchant })}
											value={r.daysAgo}
											onChange={(e) =>
												update(r.key, { daysAgo: Number(e.target.value) })
											}
											className="h-10 rounded-full border-2 border-line bg-surface px-3 text-[0.9rem]"
										>
											{daysFor(r.daysAgo).map((n) => (
												<option key={n} value={n}>
													{dayLabel(n)}
												</option>
											))}
										</select>
									</div>
									<input
										aria-label={t("Note for {name}", { name: r.merchant })}
										placeholder={t("Add a note (optional)")}
										value={r.note ?? ""}
										maxLength={200}
										onChange={(e) =>
											update(r.key, { note: e.target.value || null })
										}
										className="mt-2 ml-14 w-[calc(100%-3.5rem)] rounded-full border-2 border-transparent bg-surface px-3 py-2 text-[0.9rem] outline-none placeholder:text-ink-soft focus:border-line"
									/>
								</motion.li>
							);
						})}
					</AnimatePresence>
				</ul>
			)}

			<button
				type="button"
				onClick={addMissed}
				className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-dashed border-line font-semibold text-ink-soft hover:border-plum-300 hover:text-ink"
			>
				<Plus className="size-4" aria-hidden="true" /> {t("Add one I missed")}
			</button>

			<MaybeAlert tone="error" message={error} />
			{valid.length > 0 && (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						void saveAll();
					}}
				>
					<SubmitButton pending={pending} pendingLabel={t("Saving…")}>
						{valid.length === 1
							? t("Add {amount}", {
									amount: formatMinor(
										toMinor(
											parseAmount(valid[0]?.amountText ?? ""),
											valid[0]?.currency ?? "MYR",
										),
										valid[0]?.currency ?? "MYR",
									),
								})
							: t("Add all {n}", { n: valid.length })}
					</SubmitButton>
				</form>
			)}
			{onAgain && (
				<button
					type="button"
					onClick={onAgain}
					className="inline-flex h-11 w-full items-center justify-center gap-2 font-medium text-ink-soft hover:text-ink"
				>
					<Mic className="size-4" aria-hidden="true" /> {t("Say it again")}
				</button>
			)}
		</div>
	);
}
