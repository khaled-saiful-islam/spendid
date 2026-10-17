import {
	BILLING_CYCLES,
	type BillingCycle,
	minorDigits,
	SUBSCRIPTION_BRANDS,
	type Subscription,
	toMinor,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { buzz } from "@/lib/haptics";
import { ApiError } from "@/lib/http";
import { categoriesQuery, summaryQuery } from "@/lib/money-api";
import {
	refreshSubscriptions,
	subscriptionsApi,
} from "@/lib/subscriptions-api";
import { addDays, appToday } from "@/lib/time";
import { BrandTile } from "./brand";

export interface SubscriptionDraft {
	name: string;
	brand: string | null;
	amountText: string;
	amountVaries: boolean;
	cycle: BillingCycle;
	nextDue: string;
	remindDays: number;
	categoryId: string;
}

const CYCLES: Record<BillingCycle, string> = {
	weekly: "Weekly",
	monthly: "Monthly",
	quarterly: "Every 3 months",
	yearly: "Yearly",
};
const REMIND = [0, 1, 3, 5, 7];

const inAWeek = () => addDays(appToday(), 7);

export function draftFrom(sub: Subscription): SubscriptionDraft {
	const digits = minorDigits(sub.currency);
	return {
		name: sub.name,
		brand: sub.brand,
		amountText: (sub.amountMinor / 10 ** digits).toFixed(digits),
		amountVaries: sub.amountVaries,
		cycle: sub.cycle,
		nextDue: sub.nextDue,
		remindDays: sub.remindDays,
		categoryId: sub.categoryId,
	};
}

interface SheetProps {
	open: boolean;
	onClose: () => void;
	/** Editing an existing one, or starting from a suggestion. */
	editing?: Subscription;
	start?: Partial<SubscriptionDraft>;
}

/** Add or edit a subscription: pick a known service (or type your own), then the details. */
export function SubscriptionSheet({
	open,
	onClose,
	editing,
	start,
}: SheetProps) {
	return (
		<Sheet
			open={open}
			onClose={onClose}
			title={editing ? t("Edit subscription") : t("Add a subscription")}
		>
			{open && (
				<SubscriptionForm onDone={onClose} editing={editing} start={start} />
			)}
		</Sheet>
	);
}

function SubscriptionForm({
	onDone,
	editing,
	start,
}: {
	onDone: () => void;
	editing?: Subscription;
	start?: Partial<SubscriptionDraft>;
}) {
	const queryClient = useQueryClient();
	const { data: categories = [] } = useQuery(categoriesQuery);
	const { data: summary } = useQuery(summaryQuery);
	const currency = editing?.currency ?? summary?.homeCurrency ?? "MYR";
	const slugId = (slug: string) =>
		categories.find((c) => c.slug === slug)?.id ?? "";
	const [picking, setPicking] = useState(!editing && !start?.name);
	const [d, setD] = useState<SubscriptionDraft>(() =>
		editing
			? draftFrom(editing)
			: {
					name: "",
					brand: null,
					amountText: "",
					amountVaries: false,
					cycle: "monthly",
					nextDue: inAWeek(),
					remindDays: 3,
					categoryId: "",
					...start,
				},
	);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const patch = (p: Partial<SubscriptionDraft>) =>
		setD((x) => ({ ...x, ...p }));
	const categoryId = d.categoryId || slugId("subscriptions");

	function pick(key: string | null) {
		const brand = SUBSCRIPTION_BRANDS.find((b) => b.key === key);
		patch(
			brand
				? {
						name: brand.name,
						brand: brand.key,
						categoryId: slugId(brand.slug),
						amountVaries: brand.key === "tnb" || brand.key === "water",
					}
				: { name: "", brand: null },
		);
		setPicking(false);
	}

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		const amount = Number(d.amountText.replace(",", "."));
		if (!d.name.trim()) return setError(t("Name it"));
		if (!(amount > 0)) return setError(t("Add the amount"));
		setPending(true);
		setError(null);
		const input = {
			name: d.name.trim(),
			brand: d.brand,
			amountMinor: toMinor(amount, currency),
			currency,
			amountVaries: d.amountVaries,
			cycle: d.cycle,
			nextDue: d.nextDue,
			remindDays: d.remindDays,
			categoryId,
		};
		try {
			if (editing) await subscriptionsApi.update(editing.id, input);
			else await subscriptionsApi.create(input);
			await refreshSubscriptions(queryClient);
			buzz("success");
			toast(
				editing
					? t("Saved your changes.")
					: t("{name} added. You'll get a reminder before each payment.", {
							name: input.name,
						}),
			);
			onDone();
		} catch (err) {
			setPending(false);
			setError(
				err instanceof ApiError ? err.message : t("Couldn't save. Try again."),
			);
		}
	}

	if (picking)
		return (
			<div className="space-y-4">
				<p className="text-ink-soft">{t("Pick one, or add your own.")}</p>
				<ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
					{SUBSCRIPTION_BRANDS.map((b) => (
						<li key={b.key}>
							<button
								type="button"
								onClick={() => pick(b.key)}
								className="flex h-full w-full flex-col items-center gap-2 rounded-tile border border-line p-3 text-center hover:border-plum-300 hover:bg-surface-2"
							>
								<BrandTile sub={{ brand: b.key, name: b.name }} />
								<span className="text-[0.85rem] leading-tight font-semibold break-words">
									{t(b.name)}
								</span>
							</button>
						</li>
					))}
					<li>
						<button
							type="button"
							onClick={() => pick(null)}
							className="flex h-full w-full flex-col items-center gap-2 rounded-tile border-2 border-dashed border-line p-3 text-center hover:border-plum-300"
						>
							<span className="grid size-12 place-items-center rounded-[28%] bg-surface-2 text-plum-500">
								<Plus className="size-6" aria-hidden="true" />
							</span>
							<span className="text-[0.85rem] leading-tight font-semibold">
								{t("Something else")}
							</span>
						</button>
					</li>
				</ul>
			</div>
		);

	return (
		<form onSubmit={onSubmit} className="space-y-5">
			<div className="flex items-center gap-3">
				<BrandTile sub={{ brand: d.brand, name: d.name || "?" }} size="lg" />
				<Field
					label={t("Name")}
					value={d.name}
					maxLength={60}
					onChange={(e) => patch({ name: e.target.value })}
					className="min-w-0 flex-1"
					data-autofocus={d.name ? undefined : true}
				/>
			</div>
			<Field
				label={d.amountVaries ? t("Usual amount") : t("Amount")}
				inputMode="decimal"
				adornment={currency}
				value={d.amountText}
				data-autofocus={d.name ? true : undefined}
				onChange={(e) =>
					patch({ amountText: e.target.value.replace(/[^\d.,]/g, "") })
				}
			/>
			<label className="flex items-center gap-3 font-medium">
				<input
					type="checkbox"
					checked={d.amountVaries}
					onChange={(e) => patch({ amountVaries: e.target.checked })}
					className="size-5 accent-plum-500"
				/>
				{t("The amount changes each time (like electricity)")}
			</label>

			<fieldset className="space-y-2">
				<legend className="mb-1.5 font-semibold">{t("How often")}</legend>
				<div className="flex flex-wrap gap-2">
					{BILLING_CYCLES.map((c) => (
						<Chip
							key={c}
							on={d.cycle === c}
							onClick={() => patch({ cycle: c })}
						>
							{t(CYCLES[c])}
						</Chip>
					))}
				</div>
			</fieldset>

			<Field
				label={t("Next payment")}
				type="date"
				value={d.nextDue}
				onChange={(e) => patch({ nextDue: e.target.value })}
			/>

			<fieldset className="space-y-2">
				<legend className="mb-1.5 font-semibold">{t("Remind me")}</legend>
				<div className="flex flex-wrap gap-2">
					{REMIND.map((n) => (
						<Chip
							key={n}
							on={d.remindDays === n}
							onClick={() => patch({ remindDays: n })}
						>
							{n === 0
								? t("On the day")
								: n === 1
									? t("1 day before")
									: t("{n} days before", { n })}
						</Chip>
					))}
				</div>
			</fieldset>

			<label className="block space-y-1.5">
				<span className="block font-semibold">{t("Category")}</span>
				<select
					value={categoryId}
					onChange={(e) => patch({ categoryId: e.target.value })}
					className="h-13 w-full rounded-tile border-2 border-line bg-surface px-4"
				>
					{categories.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
			</label>

			<MaybeAlert tone="error" message={error} />
			<SubmitButton pending={pending} pendingLabel={t("Saving…")}>
				{editing ? t("Save changes") : t("Add subscription")}
			</SubmitButton>
			{!editing && (
				<button
					type="button"
					onClick={() => setPicking(true)}
					className="h-11 w-full font-medium text-ink-soft hover:text-ink"
				>
					{t("Pick a different service")}
				</button>
			)}
			{editing && (
				<button
					type="button"
					onClick={() =>
						void subscriptionsApi
							.cancel(editing.id)
							.then(() => refreshSubscriptions(queryClient))
							.then(() => {
								toast(
									t("{name} cancelled. It's no longer kept aside.", {
										name: editing.name,
									}),
									{
										label: t("Undo"),
										run: () =>
											void subscriptionsApi
												.restore(editing.id)
												.then(() => refreshSubscriptions(queryClient)),
									},
								);
								onDone();
							})
							.catch(() => setError(t("Couldn't save. Try again.")))
					}
					className="h-11 w-full font-medium text-ink-soft hover:text-over"
				>
					{t("I cancelled it")}
				</button>
			)}
		</form>
	);
}

function Chip({
	on,
	onClick,
	children,
}: {
	on: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={on}
			onClick={onClick}
			className={cn(
				"h-10 rounded-full border-2 px-4 text-[0.92rem] font-semibold transition-colors",
				on
					? "border-plum-500 bg-plum-500/12 text-ink"
					: "border-line text-ink-soft hover:text-ink",
			)}
		>
			{children}
		</button>
	);
}
