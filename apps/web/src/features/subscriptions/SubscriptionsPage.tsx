import {
	formatMinor,
	minorDigits,
	monthlyEquivalent,
	type Subscription,
	type SubscriptionOverview,
	toMinor,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Plus, RotateCcw, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { buzz } from "@/lib/haptics";
import { ApiError } from "@/lib/http";
import {
	refreshSubscriptions,
	subscriptionsApi,
	subscriptionsQuery,
} from "@/lib/subscriptions-api";
import { formatDay } from "@/lib/time";
import { BrandTile, CYCLE_LABEL, dueLabel, TONE_CLASS } from "./brand";
import { MonthHero } from "./MonthHero";
import { type SubscriptionDraft, SubscriptionSheet } from "./SubscriptionSheet";

const shortDay = (day: string) =>
	formatDay(day, {
		weekday: "short",
		day: "numeric",
		month: "short",
	});

/** Everything you pay for regularly: what's due, reminders, and one tap to log a payment. */
export function SubscriptionsPage() {
	const { data } = useQuery(subscriptionsQuery);
	const [adding, setAdding] = useState<Partial<SubscriptionDraft> | null>(null);
	const [editing, setEditing] = useState<Subscription | null>(null);
	const [paying, setPaying] = useState<Subscription | null>(null);

	if (!data)
		return <div className="h-64 animate-pulse rounded-panel bg-surface-2" />;

	return (
		<div className="space-y-5">
			<PageHeader
				title={t("Subscriptions & bills")}
				sub={t(
					"Add what you pay regularly. Spendid keeps it aside each month and reminds you before it's due.",
				)}
				aside={
					<button
						type="button"
						onClick={() => setAdding({})}
						className={buttonClass("coin", "md")}
					>
						<Plus className="size-5" aria-hidden="true" /> {t("Add")}
					</button>
				}
			/>

			{data.active.length === 0 ? (
				<EmptyStart onAdd={() => setAdding({})} />
			) : (
				<>
					<MonthHero data={data} />
					<ComingUp data={data} onPay={setPaying} />
					<AllSubscriptions data={data} onEdit={setEditing} />
				</>
			)}

			<Suggestions data={data} onAdd={setAdding} />
			<Cancelled data={data} />

			<SubscriptionSheet
				open={adding !== null}
				onClose={() => setAdding(null)}
				start={adding ?? undefined}
			/>
			<SubscriptionSheet
				open={editing !== null}
				onClose={() => setEditing(null)}
				editing={editing ?? undefined}
			/>
			<PaySheet sub={paying} onClose={() => setPaying(null)} />
		</div>
	);
}

function EmptyStart({ onAdd }: { onAdd: () => void }) {
	return (
		<section className="bg-scales rounded-panel bg-plum-900 p-6 text-plum-50 sm:p-8 dark:bg-plum-800">
			<BellRing className="size-9 text-marigold" aria-hidden="true" />
			<h2 className="mt-3 max-w-[24ch] text-[1.7rem] leading-tight font-extrabold">
				{t("Never be surprised by a bill again")}
			</h2>
			<p className="mt-2 max-w-[48ch] text-plum-100">
				{t(
					"Add Netflix, your phone bill, the gym or insurance. On the 1st, Spendid works out what's due this month and keeps it aside, then reminds you a few days before each one.",
				)}
			</p>
			<button
				type="button"
				onClick={onAdd}
				className={buttonClass("coin", "lg", "mt-5")}
			>
				<Plus className="size-5" aria-hidden="true" /> {t("Add your first")}
			</button>
		</section>
	);
}

/** Payments due soon first, then the rest of the month; each with one-tap Mark paid. */
function ComingUp({
	data,
	onPay,
}: {
	data: SubscriptionOverview;
	onPay: (s: Subscription) => void;
}) {
	const byId = new Map(data.active.map((s) => [s.id, s]));
	const soonest = [...data.active].sort((a, b) =>
		a.nextDue.localeCompare(b.nextDue),
	);
	const paidThisMonth = data.thisMonth.filter((p) => p.paid);

	return (
		<section aria-labelledby="coming-up" className="space-y-3">
			<h2 id="coming-up" className="text-[1.6rem] font-bold">
				{t("Coming up")}
			</h2>
			<ol className="space-y-2">
				<AnimatePresence initial={false}>
					{soonest.map((s, i) => {
						const due = dueLabel(s.nextDue, data.today);
						const near = due.tone !== "later";
						return (
							<motion.li
								key={s.id}
								layout
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: i * 0.04 }}
								className={cn(
									"flex flex-wrap items-center gap-3 rounded-panel border bg-surface p-3 sm:p-4",
									near ? "border-marigold/50 shadow-sm" : "border-line",
								)}
							>
								<DateBadge day={s.nextDue} />
								<BrandTile sub={s} />
								<div className="min-w-0 flex-1">
									<p className="font-semibold break-words">{s.name}</p>
									<p className="num text-[0.92rem] text-ink-soft">
										{s.amountVaries
											? t("about {amount}", {
													amount: formatMinor(s.amountMinor, s.currency),
												})
											: formatMinor(s.amountMinor, s.currency)}
									</p>
								</div>
								<span
									className={cn(
										"rounded-full px-2.5 py-1 text-[0.82rem] font-semibold",
										TONE_CLASS[due.tone],
									)}
								>
									{due.text}
								</span>
								{near && (
									<button
										type="button"
										onClick={() => onPay(s)}
										className={buttonClass("ink", "sm", "w-full sm:w-auto")}
									>
										<Check className="size-4" aria-hidden="true" />{" "}
										{t("Mark paid")}
									</button>
								)}
							</motion.li>
						);
					})}
				</AnimatePresence>
			</ol>
			{paidThisMonth.length > 0 && (
				<p className="flex flex-wrap items-center gap-2 text-[0.92rem] text-ink-soft">
					<Check className="size-4 text-safe" aria-hidden="true" />
					{t("Paid this month: {list}", {
						list: paidThisMonth
							.map((p) => byId.get(p.subscriptionId)?.name ?? "")
							.filter(Boolean)
							.join(", "),
					})}
				</p>
			)}
		</section>
	);
}

function DateBadge({ day }: { day: string }) {
	return (
		<span className="grid w-12 shrink-0 place-items-center rounded-tile bg-surface-2 py-1.5 text-center leading-none">
			<span className="text-[0.7rem] font-semibold text-ink-soft">
				{formatDay(day, { month: "short" })}
			</span>
			<span className="num font-display text-[1.35rem] font-extrabold">
				{Number(day.slice(8, 10))}
			</span>
		</span>
	);
}

function AllSubscriptions({
	data,
	onEdit,
}: {
	data: SubscriptionOverview;
	onEdit: (s: Subscription) => void;
}) {
	return (
		<section aria-labelledby="all-subs" className="space-y-3">
			<h2 id="all-subs" className="text-[1.6rem] font-bold">
				{t("All of them")}
			</h2>
			<ul className="grid gap-3 sm:grid-cols-2">
				{data.active.map((s) => (
					<li key={s.id}>
						<button
							type="button"
							onClick={() => onEdit(s)}
							className="flex h-full w-full items-start gap-3 rounded-panel border border-line bg-surface p-4 text-left transition-shadow hover:shadow-lift"
						>
							<BrandTile sub={s} />
							<span className="min-w-0 flex-1 space-y-0.5">
								<span className="block font-semibold break-words">
									{s.name}
								</span>
								<span className="num block">
									{t("{amount} {cycle}", {
										amount: formatMinor(s.amountMinor, s.currency),
										cycle: t(CYCLE_LABEL[s.cycle]),
									})}
								</span>
								<span className="block text-[0.88rem] text-ink-soft">
									{t("Next: {date}", { date: shortDay(s.nextDue) })}
								</span>
								<span className="block text-[0.88rem] text-ink-soft">
									{s.remindDays === 0
										? t("Reminder on the day")
										: s.remindDays === 1
											? t("Reminder 1 day before")
											: t("Reminder {n} days before", { n: s.remindDays })}
								</span>
							</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

/** Repeating payments found in spending that aren't added yet: one tap to add. */
function Suggestions({
	data,
	onAdd,
}: {
	data: SubscriptionOverview;
	onAdd: (start: Partial<SubscriptionDraft>) => void;
}) {
	if (data.suggestions.length === 0) return null;
	const digits = minorDigits(data.currency);
	return (
		<section
			aria-labelledby="noticed"
			className="space-y-3 rounded-panel border border-dashed border-plum-300 p-4 sm:p-5"
		>
			<h2
				id="noticed"
				className="flex items-center gap-2 text-[1.3rem] font-bold"
			>
				<Sparkles className="size-5 text-plum-500" aria-hidden="true" />{" "}
				{t("Spendid noticed these repeat")}
			</h2>
			<ul className="space-y-2">
				{data.suggestions.map((s) => (
					<li key={s.merchant} className="flex flex-wrap items-center gap-3">
						<BrandTile sub={{ brand: null, name: s.merchant }} size="sm" />
						<span className="min-w-0 flex-1">
							<span className="block font-semibold break-words">
								{s.merchant}
							</span>
							<span className="num block text-[0.88rem] text-ink-soft">
								{formatMinor(s.amountMinor, data.currency)},{" "}
								{t(
									s.cadence === "weekly"
										? "weekly"
										: s.cadence === "yearly"
											? "yearly"
											: "monthly",
								)}
							</span>
						</span>
						<button
							type="button"
							onClick={() =>
								onAdd({
									name: s.merchant,
									amountText: (s.amountMinor / 10 ** digits).toFixed(digits),
									cycle:
										s.cadence === "weekly"
											? "weekly"
											: s.cadence === "yearly"
												? "yearly"
												: "monthly",
								})
							}
							className={buttonClass("ghost", "sm", "border-2 border-line")}
						>
							<Plus className="size-4" aria-hidden="true" /> {t("Add")}
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

function Cancelled({ data }: { data: SubscriptionOverview }) {
	const queryClient = useQueryClient();
	if (data.cancelled.length === 0) return null;
	const saved = data.cancelled.reduce(
		(n, s) => n + monthlyEquivalent(s.amountMinor, s.cycle),
		0,
	);
	return (
		<section aria-labelledby="cancelled" className="space-y-3">
			<h2 id="cancelled" className="text-[1.3rem] font-bold">
				{t("Cancelled")}
			</h2>
			<p className="text-safe font-semibold">
				{t("You're saving {amount} a month by cancelling these.", {
					amount: formatMinor(saved, data.currency),
				})}
			</p>
			<ul className="space-y-2">
				{data.cancelled.map((s) => (
					<li key={s.id} className="flex items-center gap-3 opacity-80">
						<BrandTile sub={s} size="sm" className="grayscale" />
						<span className="min-w-0 flex-1 font-semibold break-words line-through decoration-ink-soft/60">
							{s.name}
						</span>
						<button
							type="button"
							onClick={() =>
								void subscriptionsApi
									.restore(s.id)
									.then(() => refreshSubscriptions(queryClient))
									.catch(() => toast(t("Couldn't save. Try again.")))
							}
							className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink"
						>
							<RotateCcw className="size-4" aria-hidden="true" />{" "}
							{t("Bring back")}
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

/** Confirms the amount, logs it as an expense, and moves the due date on. */
export function PaySheet({
	sub,
	onClose,
}: {
	sub: Subscription | null;
	onClose: () => void;
}) {
	return (
		<Sheet
			open={sub !== null}
			onClose={onClose}
			title={sub ? t("Paid {name}?", { name: sub.name }) : ""}
		>
			{sub && <PayForm key={sub.id} sub={sub} onDone={onClose} />}
		</Sheet>
	);
}

function PayForm({ sub, onDone }: { sub: Subscription; onDone: () => void }) {
	const queryClient = useQueryClient();
	const digits = minorDigits(sub.currency);
	const [amount, setAmount] = useState(
		(sub.amountMinor / 10 ** digits).toFixed(digits),
	);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		const value = Number(amount.replace(",", "."));
		if (!(value > 0)) return setError(t("Add the amount"));
		setPending(true);
		try {
			const res = await subscriptionsApi.markPaid(
				sub.id,
				toMinor(value, sub.currency),
			);
			await refreshSubscriptions(queryClient);
			buzz("success");
			toast(
				t("{name} paid and logged. Next one: {date}.", {
					name: sub.name,
					date: shortDay(res.subscription.nextDue),
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

	return (
		<form onSubmit={onSubmit} className="space-y-5">
			<div className="flex items-center gap-3">
				<BrandTile sub={sub} size="lg" />
				<p className="text-ink-soft">
					{t(
						"It's logged as an expense today, and the next payment is set for you.",
					)}
				</p>
			</div>
			<Field
				label={t("Amount paid")}
				inputMode="decimal"
				adornment={sub.currency}
				value={amount}
				data-autofocus
				onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
			/>
			<MaybeAlert tone="error" message={error} />
			<SubmitButton pending={pending} pendingLabel={t("Saving…")}>
				{t("Mark paid")}
			</SubmitButton>
			<CancelLink sub={sub} onDone={onDone} />
		</form>
	);
}

/** Cancelling lives here too: when paying is the moment people wonder if it's worth it. */
function CancelLink({
	sub,
	onDone,
}: {
	sub: Subscription;
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	return (
		<button
			type="button"
			onClick={() =>
				void subscriptionsApi
					.cancel(sub.id)
					.then(() => refreshSubscriptions(queryClient))
					.then(() => {
						toast(
							t("{name} cancelled. It's no longer kept aside.", {
								name: sub.name,
							}),
							{
								label: t("Undo"),
								run: () =>
									void subscriptionsApi
										.restore(sub.id)
										.then(() => refreshSubscriptions(queryClient)),
							},
						);
						onDone();
					})
					.catch(() => toast(t("Couldn't save. Try again.")))
			}
			className="h-11 w-full font-medium text-ink-soft hover:text-over"
		>
			{t("I cancelled it")}
		</button>
	);
}
