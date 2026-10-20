import {
	formatMinor,
	minorDigits,
	parseAmount,
	type Receipt,
	toMinor,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, TrendingDown, TrendingUp, X } from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { SubmitButton } from "@/components/form/SubmitButton";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/http";
import { categoriesQuery, refreshMoney } from "@/lib/money-api";
import { receiptImageUrl, receiptsApi } from "@/lib/receipts-api";
import { formatMoment, momentOnDay } from "@/lib/time";
import { capture } from "../capture/capture-store";
import { localDate } from "../capture/draft";

interface Line {
	key: string;
	name: string;
	quantity: number;
	totalText: string;
	warranty: number | null;
	durable: boolean;
}

/** Price (in major units of the receipt currency) from which a warranty is worth offering. */
const WARRANTY_WORTHY = 50;
const toText = (minor: number, cur: string) =>
	(minor / 10 ** minorDigits(cur)).toFixed(minorDigits(cur));
const toNum = (text: string) => parseAmount(text);
const monthYear = (iso: string) =>
	formatMoment(iso, {
		day: "numeric",
		month: "short",
	});

/** Check what was read, fix anything, save it as one expense with its items. */
export function ReceiptReview({
	receipt,
	homeCurrency,
}: {
	receipt: Receipt;
	homeCurrency: string;
}) {
	const queryClient = useQueryClient();
	const { data: categories = [] } = useQuery(categoriesQuery);
	const d = receipt.draft;
	const cur = d?.currency ?? homeCurrency;
	const [merchant, setMerchant] = useState(d?.merchant ?? "");
	const [day, setDay] = useState(d?.date ?? localDate(new Date()));
	const [totalText, setTotalText] = useState(
		d ? toText(d.totalMinor, cur) : "",
	);
	const [categoryId, setCategoryId] = useState(
		() => categories.find((c) => c.slug === d?.categorySlug)?.id ?? "",
	);
	const [lines, setLines] = useState<Line[]>(
		() =>
			d?.items.map((i, n) => ({
				key: `${n}`,
				name: i.name,
				quantity: i.quantity,
				totalText: toText(i.totalMinor, cur),
				warranty: i.warrantyMonths,
				// Only offer a warranty for items that have one, or cost enough to be worth keeping.
				durable:
					i.warrantyMonths !== null ||
					i.unitPriceMinor >= toMinor(WARRANTY_WORTHY, cur),
			})) ?? [],
	);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const memory = new Map(receipt.priceMemory.map((p) => [p.itemName, p]));
	const chosenCategory =
		categoryId || categories.find((c) => c.slug === d?.categorySlug)?.id || "";
	const itemsSum = lines.reduce(
		(s, l) => s + toMinor(toNum(l.totalText) || 0, cur),
		0,
	);
	const totalMinor = toMinor(toNum(totalText) || 0, cur);
	const gap = d?.taxMinor
		? totalMinor - itemsSum - d.taxMinor
		: totalMinor - itemsSum;
	const update = (key: string, patch: Partial<Line>) =>
		setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

	async function onSave(e: FormEvent) {
		e.preventDefault();
		if (!merchant.trim()) return setError(t("Add the shop name."));
		if (!(totalMinor > 0))
			return setError(t("Enter the total from the receipt."));
		if (!chosenCategory) return setError(t("Pick a category."));
		setPending(true);
		setError(null);
		try {
			const items = lines
				.filter((l) => l.name.trim() && toNum(l.totalText) >= 0)
				.map((l) => {
					const lineMinor = toMinor(toNum(l.totalText) || 0, cur);
					return {
						name: l.name.trim(),
						quantity: l.quantity,
						totalMinor: lineMinor,
						unitPriceMinor: Math.round(lineMinor / l.quantity),
					};
				});
			await receiptsApi.save(receipt.id, {
				merchant: merchant.trim(),
				categoryId: chosenCategory,
				currency: cur,
				totalMinor,
				// Today's receipt: the time it's saved. Another day: noon then.
				occurredAt: momentOnDay(day),
				items,
				warranties: lines
					.filter((l) => l.warranty)
					.map((l) => ({ itemName: l.name.trim(), months: l.warranty ?? 12 })),
			});
			await refreshMoney(queryClient);
			void queryClient.invalidateQueries({ queryKey: ["receipts"] });
			void queryClient.invalidateQueries({ queryKey: ["warranties"] });
			toast(
				t("Added {shop}, {amount}.", {
					shop: merchant.trim(),
					amount: formatMinor(totalMinor, cur),
				}),
				{
					label: t("Scan another"),
					run: capture.openScan,
				},
			);
			capture.close();
		} catch (err) {
			setPending(false);
			setError(
				err instanceof ApiError ? err.message : t("Couldn't save. Try again."),
			);
		}
	}

	async function onDiscard() {
		await receiptsApi.discard(receipt.id);
		await queryClient.invalidateQueries({ queryKey: ["receipts"] });
		toast(t("Receipt discarded."));
		capture.close();
	}

	const field =
		"h-11 w-full rounded-full border-2 border-line bg-bg px-4 outline-none focus:border-plum-500";

	return (
		<form onSubmit={onSave} className="space-y-5" noValidate>
			{receipt.status === "failed" && (
				<MaybeAlert
					tone="error"
					message={
						receipt.error ??
						t("We couldn't read this receipt. Fill in the details below.")
					}
				/>
			)}
			<div className="flex gap-4">
				<a
					href={receiptImageUrl(receipt.id)}
					target="_blank"
					rel="noreferrer"
					className="shrink-0"
					aria-label={t("Open the receipt photo")}
				>
					<img
						src={receiptImageUrl(receipt.id)}
						alt=""
						className="h-28 w-20 rounded-tile border border-line object-cover object-top"
					/>
				</a>
				<div className="min-w-0 flex-1 space-y-2">
					<input
						aria-label={t("Shop")}
						placeholder={t("Shop name")}
						value={merchant}
						onChange={(e) => setMerchant(e.target.value)}
						className={cn(field, "font-display text-[1.1rem] font-bold")}
					/>
					<div className="flex gap-2">
						<input
							type="date"
							aria-label={t("Date")}
							value={day}
							max={localDate(new Date())}
							onChange={(e) => setDay(e.target.value)}
							className={cn(field, "min-w-0")}
						/>
					</div>
					<select
						aria-label={t("Category")}
						value={chosenCategory}
						onChange={(e) => setCategoryId(e.target.value)}
						className={field}
					>
						<option value="">{t("Pick a category")}</option>
						{categories.map((c) => (
							<option key={c.id} value={c.id}>
								{t(c.name)}
							</option>
						))}
					</select>
				</div>
			</div>

			<label className="flex items-center justify-between gap-4 rounded-panel bg-plum-900 px-5 py-4 text-plum-50 dark:bg-plum-800">
				<span className="font-semibold">{t("Total paid")}</span>
				<span className="flex items-baseline gap-2">
					<span className="text-plum-200">{cur}</span>
					<input
						inputMode="decimal"
						aria-label={t("Total paid")}
						value={totalText}
						onChange={(e) =>
							setTotalText(e.target.value.replace(/[^\d.,]/g, ""))
						}
						className="num w-36 bg-transparent text-right text-[2rem] leading-none font-extrabold text-marigold outline-none"
					/>
				</span>
			</label>

			{lines.length > 0 && (
				<section aria-label={t("Items on the receipt")}>
					<h3 className="mb-2 font-display text-[1.15rem] font-bold">
						{t("Items")}
					</h3>
					<ul className="divide-y divide-line rounded-panel border border-line">
						{lines.map((l, i) => {
							const mem = memory.get(l.name);
							return (
								<motion.li
									key={l.key}
									layout
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: i * 0.04 }}
									className="px-3 py-2.5"
								>
									<div className="flex items-center gap-2">
										<input
											aria-label={t("Item {n}", { n: i + 1 })}
											value={l.name}
											onChange={(e) => update(l.key, { name: e.target.value })}
											className="min-w-0 flex-1 bg-transparent font-medium outline-none"
										/>
										{l.quantity !== 1 && (
											<span className="shrink-0 text-[0.85rem] text-ink-soft">
												×{l.quantity}
											</span>
										)}
										<input
											inputMode="decimal"
											aria-label={t("Price of {name}", { name: l.name })}
											value={l.totalText}
											onChange={(e) =>
												update(l.key, {
													totalText: e.target.value.replace(/[^\d.,]/g, ""),
												})
											}
											className="num w-20 bg-transparent text-right font-semibold outline-none"
										/>
										<button
											type="button"
											onClick={() =>
												setLines((ls) => ls.filter((x) => x.key !== l.key))
											}
											aria-label={t("Remove {name}", { name: l.name })}
											className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:text-over"
										>
											<X className="size-4" />
										</button>
									</div>
									<div className="mt-1 flex flex-wrap items-center gap-2">
										{mem && (
											<span
												className={cn(
													"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8rem] font-semibold",
													mem.changePct > 0
														? "bg-coral/12 text-over"
														: "bg-jade/12 text-safe",
												)}
											>
												{mem.changePct > 0 ? (
													<TrendingUp className="size-3.5" aria-hidden="true" />
												) : (
													<TrendingDown
														className="size-3.5"
														aria-hidden="true"
													/>
												)}
												{mem.changePct > 0 ? t("Up") : t("Down")}{" "}
												{t("{pct}% since {date}", {
													pct: Math.abs(mem.changePct),
													date: monthYear(mem.previousAt),
												})}
											</span>
										)}
										{l.durable && (
											<label
												className={cn(
													"inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.8rem]",
													l.warranty
														? "bg-plum-500/12 font-semibold text-plum-500"
														: "text-ink-soft",
												)}
											>
												<input
													type="checkbox"
													checked={Boolean(l.warranty)}
													onChange={(e) =>
														update(l.key, {
															warranty: e.target.checked ? 12 : null,
														})
													}
													className="sr-only"
												/>
												<ShieldCheck className="size-3.5" aria-hidden="true" />
												{l.warranty
													? t("Warranty kept, {n} months", { n: l.warranty })
													: t("Keep warranty")}
											</label>
										)}
									</div>
								</motion.li>
							);
						})}
					</ul>
					{Math.abs(gap) > 1 && totalMinor > 0 && (
						<p className="mt-2 text-[0.85rem] text-ink-soft">
							{d?.taxMinor
								? t(
										"Items add up to {amount} plus {tax} tax. The total paid is what counts.",
										{
											amount: formatMinor(itemsSum, cur),
											tax: formatMinor(d.taxMinor, cur),
										},
									)
								: t(
										"Items add up to {amount}. The total paid is what counts.",
										{ amount: formatMinor(itemsSum, cur) },
									)}
						</p>
					)}
				</section>
			)}

			<div className="space-y-2">
				<MaybeAlert tone="error" message={error} />
				<SubmitButton pending={pending} pendingLabel={t("Saving…")}>
					{totalMinor > 0
						? t("Add {amount}", { amount: formatMinor(totalMinor, cur) })
						: t("Add expense")}
				</SubmitButton>
				<button
					type="button"
					onClick={() => void onDiscard()}
					className="h-11 w-full font-medium text-ink-soft hover:text-over"
				>
					{t("Discard this receipt")}
				</button>
			</div>
		</form>
	);
}
