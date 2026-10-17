import { daysUntil, formatMinor, type Subscription } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { TINTS } from "@/components/money/CategoryIcon";
import { buttonClass } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { subscriptionsQuery } from "@/lib/subscriptions-api";
import { BrandTile, dueLabel, TONE_CLASS } from "./brand";
import { PaySheet } from "./SubscriptionsPage";

/** On Home: subscriptions inside their reminder window (or late), each one tap from paid. */
export function DueSoonCard() {
	const { data } = useQuery(subscriptionsQuery);
	const [paying, setPaying] = useState<Subscription | null>(null);
	if (!data) return null;
	const due = data.active.filter(
		(s) => daysUntil(s.nextDue, data.today) <= Math.max(s.remindDays, 1),
	);
	if (due.length === 0) return null;
	const total = due.reduce((n, s) => n + s.amountMinor, 0);

	return (
		<section
			aria-labelledby="due-soon"
			className="rounded-panel border-2 border-marigold/60 bg-surface p-5"
		>
			<div className="flex items-center gap-3">
				<motion.span
					className="grid size-11 shrink-0 place-items-center rounded-full bg-marigold text-plum-900"
					animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
					transition={{ duration: 0.9, delay: 0.6 }}
				>
					<BellRing className="size-5" aria-hidden="true" />
				</motion.span>
				<div className="min-w-0 flex-1">
					<h2 id="due-soon" className="text-[1.3rem] font-bold">
						{due.length === 1
							? t("1 payment due soon")
							: t("{n} payments due soon", { n: due.length })}
					</h2>
					<p className="num text-[0.92rem] text-ink-soft">
						{t("{amount}, already kept aside", {
							amount: formatMinor(total, data.currency),
						})}
					</p>
				</div>
				<Link
					to="/app/subscriptions"
					aria-label={t("Open subscriptions")}
					className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-2"
				>
					<ChevronRight className="size-5" />
				</Link>
			</div>
			<ul className="mt-4 space-y-2">
				{due.map((s) => {
					const label = dueLabel(s.nextDue, data.today);
					return (
						<li key={s.id} className="flex items-center gap-3">
							<BrandTile sub={s} size="sm" />
							<span className="min-w-0 flex-1">
								<span className="block font-semibold break-words">
									{s.name}
								</span>
								<span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
									<span className="num text-[0.88rem] text-ink-soft">
										{formatMinor(s.amountMinor, s.currency)}
									</span>
									<span
										className={cn(
											"rounded-full px-2 py-0.5 text-[0.78rem] font-semibold",
											TONE_CLASS[label.tone],
										)}
									>
										{label.text}
									</span>
								</span>
							</span>
							<button
								type="button"
								onClick={() => setPaying(s)}
								className="h-10 shrink-0 rounded-full bg-plum-900 px-4 text-[0.9rem] font-semibold text-plum-50 hover:bg-plum-800 dark:bg-plum-50 dark:text-plum-900"
							>
								{t("Mark paid")}
							</button>
						</li>
					);
				})}
			</ul>
			<PaySheet sub={paying} onClose={() => setPaying(null)} />
		</section>
	);
}

/** On Plan: a doorway with this month's total and the next payment. */
/** Plan's view of regular payments: the month's total and the next few, each with its due date. */
export function SubscriptionsDoorway() {
	const { data } = useQuery(subscriptionsQuery);
	const upcoming = (data?.active ?? []).slice(0, 3);

	return (
		<section aria-labelledby="subs-heading" className="space-y-3">
			<SectionHeader
				id="subs-heading"
				title={t("Subscriptions & bills")}
				icon={BellRing}
				tint="amber"
				sub={
					data && data.active.length > 0
						? t("{amount} this month, kept aside for you", {
								amount: formatMinor(data.thisMonthMinor, data.currency),
							})
						: undefined
				}
				action={
					<Link
						to="/app/subscriptions"
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						{t("See all")}
						<ChevronRight className="size-4" aria-hidden="true" />
					</Link>
				}
			/>
			{data && upcoming.length > 0 ? (
				<ol className="relative overflow-hidden rounded-panel border border-line bg-surface p-2">
					<span
						aria-hidden="true"
						className={cn(
							"pointer-events-none absolute inset-0 bg-linear-to-br opacity-[0.12] dark:opacity-[0.09]",
							TINTS.amber,
						)}
					/>
					{upcoming.map((s) => {
						const due = dueLabel(s.nextDue, data.today);
						return (
							<li key={s.id} className="relative">
								<Link
									to="/app/subscriptions"
									className="flex items-center gap-3 rounded-tile px-2 py-2.5 hover:bg-surface-2/70"
								>
									<BrandTile sub={s} size="sm" />
									<span className="min-w-0 flex-1">
										<span className="block font-semibold break-words">
											{s.name}
										</span>
										<span
											data-money
											className="num block text-[0.85rem] text-ink-soft"
										>
											{formatMinor(s.amountMinor, s.currency)}
										</span>
									</span>
									<span
										className={cn(
											"shrink-0 rounded-full px-2.5 py-1 text-[0.8rem] font-semibold",
											TONE_CLASS[due.tone],
										)}
									>
										{due.text}
									</span>
								</Link>
							</li>
						);
					})}
				</ol>
			) : (
				<Link
					to="/app/subscriptions"
					className="block rounded-panel border-2 border-dashed border-line p-5 text-ink-soft hover:border-plum-300"
				>
					{t("Add what you pay regularly and get reminded before it's due.")}
				</Link>
			)}
		</section>
	);
}
