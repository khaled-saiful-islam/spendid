import { daysUntil, formatMinor, type Subscription } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
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
export function SubscriptionsDoorway() {
	const { data } = useQuery(subscriptionsQuery);
	const next = data?.active[0];
	return (
		<Link
			to="/app/subscriptions"
			className="flex items-center gap-4 rounded-panel border border-line bg-surface p-5 transition-shadow hover:shadow-lift"
		>
			<span className="flex -space-x-3" aria-hidden="true">
				{(data?.active ?? []).slice(0, 3).map((s) => (
					<BrandTile
						key={s.id}
						sub={s}
						size="md"
						className="ring-3 ring-surface"
					/>
				))}
				{(data?.active.length ?? 0) === 0 && (
					<span className="grid size-12 place-items-center rounded-[28%] bg-marigold text-plum-900">
						<BellRing className="size-6" />
					</span>
				)}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-[1.3rem] font-bold">
					{t("Subscriptions & bills")}
				</span>
				<span className="block text-ink-soft">
					{data && next
						? t("{amount} this month. Next: {name}, {when}.", {
								amount: formatMinor(data.thisMonthMinor, data.currency),
								name: next.name,
								when: dueLabel(next.nextDue, data.today).text.toLowerCase(),
							})
						: t("Add what you pay regularly and get reminded before it's due.")}
				</span>
			</span>
			<ChevronRight
				className="size-5 shrink-0 text-ink-soft"
				aria-hidden="true"
			/>
		</Link>
	);
}
