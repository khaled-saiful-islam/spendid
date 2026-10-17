import { formatMinor, minorDigits, type Transaction } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { SubmitButton } from "@/components/form/SubmitButton";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/http";
import { categoriesQuery, moneyApi, refreshMoney } from "@/lib/money-api";
import { addDays, appToday, formatDay } from "@/lib/time";
import { currencyOptions } from "../onboarding/options";
import type { TypePrefill } from "./capture-store";
import {
	applyShorthand,
	type Day,
	type Draft,
	draftFrom,
	draftMinor,
	draftOccurredAt,
	emptyDraft,
} from "./draft";
import { ShopSuggestions } from "./ShopSuggestions";

interface ExpenseFormProps {
	homeCurrency: string;
	editing?: Transaction;
	prefill?: TypePrefill;
	onDone: () => void;
}

const chip =
	"inline-flex h-10 items-center gap-2 rounded-full border-2 px-3.5 text-[0.92rem] font-medium transition-colors";
const chipOn = "border-plum-500 bg-plum-500/10 text-ink";
const chipOff = "border-line text-ink-soft hover:border-plum-300";

export function ExpenseForm({
	homeCurrency,
	editing,
	prefill,
	onDone,
}: ExpenseFormProps) {
	const queryClient = useQueryClient();
	const { data: categories = [] } = useQuery(categoriesQuery);
	const [draft, setDraft] = useState<Draft>(() =>
		editing
			? draftFrom(editing)
			: prefill && "merchant" in prefill
				? {
						...emptyDraft(prefill.currency),
						merchant: prefill.merchant,
						amountText: (
							prefill.amountMinor /
							10 ** minorDigits(prefill.currency)
						).toFixed(minorDigits(prefill.currency)),
					}
				: emptyDraft(homeCurrency),
	);
	const sharedText = prefill && "text" in prefill ? prefill.text : "";
	const [shorthand, setShorthand] = useState(sharedText);
	const [pickedByHand, setPickedByHand] = useState(Boolean(editing));
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	// Text shared from another app is read like typed shorthand once categories are known.
	const readShared = useRef(false);
	useEffect(() => {
		if (!sharedText || readShared.current || categories.length === 0) return;
		readShared.current = true;
		setDraft((d) => applyShorthand(d, sharedText, categories, false));
	}, [sharedText, categories]);

	const minor = draftMinor(draft);
	const category = categories.find((c) => c.id === draft.categoryId);
	const { popular } = currencyOptions("en");
	const currencies = [
		homeCurrency,
		...popular.map((c) => c.code).filter((c) => c !== homeCurrency),
	];
	const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (minor === null) return setError(t("Enter how much it was."));
		if (!draft.categoryId) return setError(t("Pick a category."));
		setPending(true);
		setError(null);
		const body = {
			amountMinor: minor,
			currency: draft.currency,
			categoryId: draft.categoryId,
			merchant: draft.merchant.trim() || null,
			occurredAt: draftOccurredAt(draft.day),
		};
		try {
			if (editing) {
				const unchangedDay = draftFrom(editing).day === draft.day;
				await moneyApi.updateTransaction(
					editing.id,
					unchangedDay ? { ...body, occurredAt: undefined } : body,
				);
				toast(t("Saved your changes."));
			} else {
				const created = await moneyApi.addTransaction({
					...body,
					source: "manual",
				});
				toast(
					`Added ${body.merchant ?? category?.name ?? "expense"}, ${formatMinor(minor, draft.currency)}.`,
					{
						label: t("Undo"),
						run: () =>
							void moneyApi
								.deleteTransaction(created.id)
								.then(() => refreshMoney(queryClient)),
					},
				);
			}
			await refreshMoney(queryClient);
			onDone();
		} catch (err) {
			setPending(false);
			setError(
				err instanceof ApiError ? err.message : t("Couldn't save. Try again."),
			);
		}
	}

	async function onDelete() {
		if (!editing) return;
		await moneyApi.deleteTransaction(editing.id);
		await refreshMoney(queryClient);
		toast(t("Expense removed."), {
			label: t("Undo"),
			run: () =>
				void moneyApi
					.restoreTransaction(editing.id)
					.then(() => refreshMoney(queryClient)),
		});
		onDone();
	}

	const days: { value: Day; label: string }[] = [
		{ value: "today", label: t("Today") },
		{ value: "yesterday", label: t("Yesterday") },
	];
	const customDay =
		draft.day !== "today" && draft.day !== "yesterday" ? draft.day : "";
	const today = appToday();
	/** The four days before yesterday, one tap each. */
	const recentDays = [2, 3, 4, 5].map((n) => addDays(today, -n));
	const earlierDay =
		customDay && !recentDays.includes(customDay) ? customDay : "";

	return (
		<form onSubmit={onSubmit} className="space-y-5" noValidate>
			{!editing && (
				<div className="space-y-1.5">
					<label htmlFor="shorthand" className="block font-semibold">
						{t("Type it like you'd say it")}
					</label>
					<input
						id="shorthand"
						data-autofocus
						autoComplete="off"
						placeholder={t("lunch 12.50, grab rm9 yesterday…")}
						value={shorthand}
						onChange={(e) => {
							setShorthand(e.target.value);
							setDraft((d) =>
								applyShorthand(d, e.target.value, categories, pickedByHand),
							);
						}}
						className="h-14 w-full rounded-tile border-2 border-line bg-bg px-4 text-[1.1rem] outline-none focus:border-plum-500"
					/>
				</div>
			)}

			<motion.div
				layout
				className="flex items-center gap-4 rounded-panel bg-plum-900 p-4 text-plum-50 dark:bg-plum-800"
			>
				<CategoryIcon icon={category?.icon} tint={category?.tint} size="lg" />
				<div className="min-w-0 flex-1 space-y-1">
					<input
						aria-label={t("What was it?")}
						placeholder={t("What was it?")}
						value={draft.merchant}
						onChange={(e) => patch({ merchant: e.target.value })}
						className="w-full bg-transparent font-display text-[1.25rem] font-bold text-plum-50 outline-none placeholder:text-plum-300"
					/>
					<div className="flex items-center gap-2">
						<select
							aria-label={t("Currency")}
							value={draft.currency}
							onChange={(e) => patch({ currency: e.target.value })}
							className="h-9 rounded-full bg-white/12 px-2.5 text-[0.9rem] font-semibold text-plum-50 outline-none"
						>
							{currencies.map((c) => (
								<option key={c} value={c} className="text-ink">
									{c}
								</option>
							))}
						</select>
						<input
							aria-label={t("Amount")}
							inputMode="decimal"
							placeholder="0.00"
							value={draft.amountText}
							onChange={(e) =>
								patch({ amountText: e.target.value.replace(/[^\d.,]/g, "") })
							}
							className="num w-full min-w-0 bg-transparent text-[2rem] leading-none font-extrabold text-marigold outline-none placeholder:text-plum-300"
						/>
					</div>
				</div>
			</motion.div>
			{draft.currency !== homeCurrency && (
				<p className="-mt-2 text-[0.9rem] text-ink-soft">
					{t("Converted to {currency} at today's rate when you save.", {
						currency: homeCurrency,
					})}
				</p>
			)}
			<ShopSuggestions
				typed={draft.merchant}
				categories={categories}
				onPick={(shop) =>
					patch({
						merchant: shop.name,
						...(!pickedByHand &&
							shop.categoryId && { categoryId: shop.categoryId }),
					})
				}
			/>

			<fieldset>
				<legend className="mb-2 font-semibold">{t("When")}</legend>
				<div className="flex flex-wrap gap-2">
					{days.map((d) => (
						<button
							key={d.value}
							type="button"
							aria-pressed={draft.day === d.value}
							onClick={() => patch({ day: d.value, dayTyped: false })}
							className={cn(chip, draft.day === d.value ? chipOn : chipOff)}
						>
							{d.label}
						</button>
					))}
					{recentDays.map((d) => (
						<button
							key={d}
							type="button"
							aria-pressed={draft.day === d}
							onClick={() => patch({ day: d, dayTyped: false })}
							className={cn(chip, draft.day === d ? chipOn : chipOff)}
						>
							{formatDay(d, { weekday: "short", day: "numeric" })}
						</button>
					))}
					<label
						className={cn(
							chip,
							"relative cursor-pointer gap-1.5",
							earlierDay ? chipOn : chipOff,
						)}
					>
						<CalendarDays className="size-4" aria-hidden="true" />
						{earlierDay
							? formatDay(earlierDay, { day: "numeric", month: "short" })
							: t("Earlier date")}
						<input
							type="date"
							aria-label={t("Pick another day")}
							max={today}
							value={customDay}
							onClick={(e) => {
								try {
									e.currentTarget.showPicker?.();
								} catch {
									// Older browsers open their own picker on tap.
								}
							}}
							onChange={(e) =>
								e.target.value &&
								patch({ day: e.target.value, dayTyped: false })
							}
							className="absolute inset-0 cursor-pointer opacity-0"
						/>
					</label>
				</div>
			</fieldset>

			<fieldset>
				<legend className="mb-2 font-semibold">{t("Category")}</legend>
				<div className="flex flex-wrap gap-2">
					{categories.map((c) => (
						<button
							key={c.id}
							type="button"
							aria-pressed={draft.categoryId === c.id}
							onClick={() => {
								setPickedByHand(true);
								patch({ categoryId: c.id });
							}}
							className={cn(
								chip,
								"pl-1.5",
								draft.categoryId === c.id ? chipOn : chipOff,
							)}
						>
							<CategoryIcon
								icon={c.icon}
								tint={c.tint}
								size="sm"
								className="size-7"
							/>
							{c.name}
						</button>
					))}
				</div>
			</fieldset>

			<div className="space-y-3">
				<MaybeAlert tone="error" message={error} />
				<SubmitButton pending={pending} pendingLabel={t("Saving…")}>
					{editing
						? t("Save changes")
						: minor
							? t("Add {amount}", {
									amount: formatMinor(minor, draft.currency),
								})
							: t("Add expense")}
				</SubmitButton>
				{editing && (
					<button
						type="button"
						onClick={onDelete}
						className="inline-flex h-11 w-full items-center justify-center gap-2 font-medium text-over"
					>
						<Trash2 className="size-4" aria-hidden="true" />{" "}
						{t("Remove this expense")}
					</button>
				)}
			</div>
		</form>
	);
}
