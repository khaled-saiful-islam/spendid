import {
	formatMinor,
	monthlyEquivalent,
	type SubscriptionOverview,
} from "@spendid/shared";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { CountUp } from "@/components/money/CountUp";
import { dateLocale, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { looksOf } from "./brand";

/** This month in one card: the total, a bar split by service, and a calendar of due days. */
export function MonthHero({ data }: { data: SubscriptionOverview }) {
	const reduce = useReducedMotion();
	const money = (m: number) => formatMinor(m, data.currency);
	const monthly = data.active
		.map((s) => ({ s, minor: monthlyEquivalent(s.amountMinor, s.cycle) }))
		.sort((a, b) => b.minor - a.minor);
	const total = monthly.reduce((n, x) => n + x.minor, 0) || 1;
	const monthName = new Date(`${data.today}T12:00`).toLocaleDateString(
		dateLocale(),
		{
			month: "long",
		},
	);

	return (
		<section
			aria-labelledby="subs-month"
			className="bg-scales relative overflow-hidden rounded-panel bg-plum-900 p-5 text-plum-50 sm:p-7 dark:bg-plum-800"
		>
			<p id="subs-month" className="font-semibold text-plum-200">
				{t("Due in {month}", { month: monthName })}
			</p>
			<p className="num mt-1 font-display text-[clamp(2.4rem,10vw,3.4rem)] leading-none font-extrabold text-marigold">
				<CountUp minor={data.thisMonthMinor} currency={data.currency} />
			</p>
			<p className="mt-2 max-w-[46ch] text-plum-100">
				{data.stillDueMinor > 0
					? t(
							"{amount} still to pay. It's already kept aside in your safe-to-spend.",
							{
								amount: money(data.stillDueMinor),
							},
						)
					: t("All paid for this month.")}
			</p>

			<div
				className="mt-5 flex h-4 w-full gap-[2px] overflow-hidden rounded-full bg-white/10"
				role="img"
				aria-label={t("Monthly cost by subscription")}
			>
				{monthly.map(({ s, minor }, i) => (
					<motion.span
						key={s.id}
						className="h-full first:rounded-l-full last:rounded-r-full"
						style={{ backgroundColor: looksOf(s).color }}
						initial={{ width: reduce ? `${(minor / total) * 100}%` : 0 }}
						animate={{ width: `${(minor / total) * 100}%` }}
						transition={{
							delay: 0.15 + i * 0.06,
							duration: 0.6,
							ease: "easeOut",
						}}
					/>
				))}
			</div>
			<ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.88rem] text-plum-100">
				{monthly.map(({ s, minor }) => (
					<li key={s.id} className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="size-2.5 rounded-full"
							style={{ backgroundColor: looksOf(s).color }}
						/>
						{s.name}{" "}
						<span className="num font-semibold text-plum-50">
							{money(minor)}
						</span>
					</li>
				))}
			</ul>

			<div className="mt-6 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
				<dl className="grid grid-cols-2 gap-4">
					<div>
						<dt className="text-[0.85rem] text-plum-200">
							{t("Every month, on average")}
						</dt>
						<dd className="num text-[1.3rem] font-bold">
							{money(Math.round(data.yearlyMinor / 12))}
						</dd>
					</div>
					<div>
						<dt className="text-[0.85rem] text-plum-200">{t("Over a year")}</dt>
						<dd className="num text-[1.3rem] font-bold">
							{money(data.yearlyMinor)}
						</dd>
					</div>
				</dl>
				<MiniCalendar data={data} />
			</div>
		</section>
	);
}

/** The month as a small grid; due days carry the services' colours. */
function MiniCalendar({ data }: { data: SubscriptionOverview }) {
	const [y, m] = data.today.split("-").map(Number) as [number, number];
	const first = new Date(y, m - 1, 1);
	const days = new Date(y, m, 0).getDate();
	const lead = (first.getDay() + 6) % 7; // Monday first
	const todayN = Number(data.today.slice(8, 10));
	const [picked, setPicked] = useState<number | null>(null);
	const byDay = new Map<number, typeof data.thisMonth>();
	for (const p of data.thisMonth) {
		const n = Number(p.day.slice(8, 10));
		byDay.set(n, [...(byDay.get(n) ?? []), p]);
	}
	const subOf = new Map(data.active.map((s) => [s.id, s]));
	const weekdays = Array.from({ length: 7 }, (_, i) =>
		new Date(2024, 0, 1 + i).toLocaleDateString(dateLocale(), {
			weekday: "narrow",
		}),
	);
	const pickedItems = picked ? (byDay.get(picked) ?? []) : [];

	return (
		<div className="rounded-tile bg-white/8 p-3">
			<div
				className="grid grid-cols-7 gap-1 text-center text-[0.7rem] text-plum-200"
				aria-hidden="true"
			>
				{weekdays.map((w, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday header
					<span key={i}>{w}</span>
				))}
			</div>
			<div className="mt-1 grid grid-cols-7 gap-1">
				{Array.from({ length: lead }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: empty lead-in cells
					<span key={`lead-${i}`} />
				))}
				{Array.from({ length: days }, (_, i) => {
					const n = i + 1;
					const due = byDay.get(n) ?? [];
					const label = due.length
						? `${n}: ${due.map((p) => subOf.get(p.subscriptionId)?.name ?? "").join(", ")}`
						: String(n);
					return (
						<button
							key={n}
							type="button"
							disabled={due.length === 0}
							onClick={() => setPicked(picked === n ? null : n)}
							aria-label={label}
							aria-pressed={due.length ? picked === n : undefined}
							className={cn(
								"relative grid size-8 place-items-center rounded-lg text-[0.78rem] font-semibold",
								n === todayN && "ring-2 ring-marigold",
								n < todayN ? "text-plum-300" : "text-plum-50",
								due.length > 0 && "bg-white/14 hover:bg-white/24",
								picked === n && "bg-white/30",
							)}
						>
							{n}
							{due.length > 0 && (
								<span
									className="absolute bottom-0.5 flex gap-[2px]"
									aria-hidden="true"
								>
									{due.slice(0, 3).map((p) => {
										const s = subOf.get(p.subscriptionId);
										return (
											<span
												key={`${p.subscriptionId}-${p.day}`}
												className="size-1.5 rounded-full"
												style={{
													backgroundColor: s ? looksOf(s).color : "#fff",
												}}
											/>
										);
									})}
								</span>
							)}
						</button>
					);
				})}
			</div>
			{pickedItems.length > 0 && (
				<p className="mt-2 text-[0.85rem] text-plum-100" aria-live="polite">
					{pickedItems
						.map(
							(p) =>
								`${subOf.get(p.subscriptionId)?.name ?? ""} ${formatMinor(p.amountMinor, data.currency)}`,
						)
						.join(", ")}
				</p>
			)}
		</div>
	);
}
