import { formatMinor } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { t } from "@/i18n";
import {
	heatmapQuery,
	monthName,
	recurringQuery,
	shiftMonth,
	thisMonth,
	wrappedQuery,
} from "@/lib/insights-api";
import { summaryQuery } from "@/lib/money-api";
import { Heatmap } from "./Heatmap";
import { MoneyFlow } from "./MoneyFlow";
import { Subscriptions } from "./Subscriptions";

function WrappedTeaser({ month }: { month: string }) {
	const reduce = useReducedMotion();
	const { data } = useQuery(wrappedQuery(month));
	if (!data)
		return <div className="h-32 animate-pulse rounded-panel bg-surface-2" />;
	const name = monthName(month, { month: "long" });
	return (
		<Link
			to="/app/wrapped"
			search={{ month }}
			className="group relative block overflow-hidden rounded-panel bg-linear-to-br from-plum-500 via-coral to-marigold p-4 text-white shadow-lift dark:bg-none dark:bg-plum-800"
		>
			<div
				className="bg-scales pointer-events-none absolute inset-0 opacity-20"
				aria-hidden="true"
			/>
			<motion.span
				aria-hidden="true"
				className="absolute top-4 right-4 grid size-12 place-items-center rounded-full bg-white/20 text-[1.6rem] ring-1 ring-white/40"
				animate={reduce ? undefined : { rotate: [0, 8, -6, 0], y: [0, -4, 0] }}
				transition={{ repeat: Number.POSITIVE_INFINITY, duration: 5 }}
			>
				{data.personality.emoji}
			</motion.span>
			<p className="relative flex items-center gap-1.5 pr-20 font-semibold text-white/85">
				<Sparkles className="size-4" aria-hidden="true" /> {t("Money Wrapped")}
			</p>
			<p className="relative mt-0.5 max-w-[18ch] pr-16 text-[1.3rem] leading-tight font-bold">
				{data.inProgress
					? t("{month} so far", { month: name })
					: t("Your {month}", { month: name })}
			</p>
			<p className="relative mt-1 text-[0.92rem] text-white/90">
				{t("{title}, {amount} across {n} expenses", {
					title: t(data.personality.title),
					amount: formatMinor(data.totalMinor, data.currency),
					n: data.count,
				})}
			</p>
			<span className="relative mt-3 inline-flex min-h-10 items-center rounded-full bg-white px-4 font-semibold text-plum-900 transition-transform group-hover:translate-x-1">
				{t("Play the story")}
			</span>
		</Link>
	);
}

/** The money-flow chart for a month (income and savings from the current plan). */
function FlowSection({ month }: { month: string }) {
	const { data } = useQuery(wrappedQuery(month));
	const { data: summary } = useQuery(summaryQuery);
	if (!data || !summary) return null;
	return (
		<MoneyFlow
			data={data}
			incomeMinor={summary.incomeMinor}
			reservedMinor={summary.reservedMinor}
			savedLabel={
				summary.method === "pay_yourself_first"
					? t("Transfers and savings")
					: undefined
			}
		/>
	);
}

/** Insights: the month as a heatmap, its Wrapped story, and subscriptions found in spending. */
export function InsightsView() {
	const [month, setMonth] = useState(thisMonth());
	const current = thisMonth();
	const heat = useQuery(heatmapQuery(month));
	const recurring = useQuery(recurringQuery);

	return (
		<div className="space-y-4 sm:space-y-5">
			<div className="flex items-center justify-between gap-2 rounded-full border border-line bg-surface p-1">
				<button
					type="button"
					onClick={() => setMonth(shiftMonth(month, -1))}
					aria-label={t("Previous month")}
					className="grid size-11 place-items-center rounded-full hover:bg-surface-2"
				>
					<ChevronLeft className="size-5" aria-hidden="true" />
				</button>
				<p className="text-center font-semibold" aria-live="polite">
					{monthName(month)}
				</p>
				<button
					type="button"
					onClick={() => setMonth(shiftMonth(month, 1))}
					disabled={month >= current}
					aria-label={t("Next month")}
					className="grid size-11 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30"
				>
					<ChevronRight className="size-5" aria-hidden="true" />
				</button>
			</div>
			<WrappedTeaser month={month} />
			<FlowSection month={month} />
			<section className="rounded-panel border border-line bg-surface p-4 sm:p-5">
				{heat.data ? (
					<Heatmap data={heat.data} />
				) : (
					<div className="h-72 animate-pulse rounded-tile bg-surface-2" />
				)}
			</section>
			{recurring.data ? (
				<Subscriptions data={recurring.data} />
			) : (
				<div className="h-40 animate-pulse rounded-panel bg-surface-2" />
			)}
		</div>
	);
}
