import { formatMinor } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { heatmapQuery, shiftMonth, thisMonth } from "@/lib/insights-api";
import { addDays, appToday, formatDay } from "@/lib/time";

const BAR_H = 64;

/**
 * The last seven days as bars against today's daily amount: green under it, coral over it,
 * today ringed in gold. Tap a bar for that day's total. Sits inside the dark home hero.
 */
export function WeekRhythm({
	dailyMinor,
	currency,
}: {
	dailyMinor: number;
	currency: string;
}) {
	const reduce = useReducedMotion();
	const month = thisMonth();
	const { data: now } = useQuery(heatmapQuery(month));
	const { data: before } = useQuery(heatmapQuery(shiftMonth(month, -1)));
	const today = appToday();
	const [picked, setPicked] = useState(today);
	if (!now) return <div className="mt-5 h-24" aria-hidden="true" />;

	const spent = new Map(
		[...(before?.days ?? []), ...now.days].map((d) => [d.day, d.minor]),
	);
	const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
	const values = days.map((d) => spent.get(d) ?? 0);
	const top = Math.max(dailyMinor * 1.6, ...values, 1);
	const line = dailyMinor > 0 ? (dailyMinor / top) * BAR_H : null;
	const money = (m: number) => formatMinor(m, currency);
	const pickedValue = spent.get(picked) ?? 0;

	return (
		<figure className="mt-5 border-t border-white/10 pt-4">
			<figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.82rem]">
				<span className="font-semibold text-plum-200">{t("Last 7 days")}</span>
				<span data-money className="num font-semibold" aria-live="polite">
					{picked === today
						? t("Today: {amount}", { amount: money(pickedValue) })
						: `${formatDay(picked, { weekday: "short", day: "numeric" })}: ${money(pickedValue)}`}
				</span>
			</figcaption>
			<div className="relative mt-3" style={{ height: BAR_H }}>
				{line !== null && (
					<span
						aria-hidden="true"
						className="absolute inset-x-0 border-t border-dashed border-white/35"
						style={{ bottom: line }}
					/>
				)}
				<ol className="absolute inset-0 grid grid-cols-7 items-end gap-2">
					{days.map((d, i) => {
						const v = values[i] ?? 0;
						const over = dailyMinor > 0 && v > dailyMinor;
						const isToday = d === today;
						return (
							<li key={d} className="flex h-full items-end justify-center">
								<button
									type="button"
									onClick={() => setPicked(d)}
									aria-pressed={picked === d}
									aria-label={`${formatDay(d, { weekday: "long", day: "numeric", month: "long" })}: ${money(v)}`}
									className="flex h-full w-full max-w-9 items-end"
								>
									<motion.span
										className={cn(
											"block w-full rounded-t-[0.4rem] rounded-b-[0.2rem]",
											v === 0 ? "bg-white/15" : over ? "bg-coral" : "bg-jade",
											isToday &&
												"ring-2 ring-marigold ring-offset-2 ring-offset-plum-900 dark:ring-offset-plum-800",
											picked === d && !isToday && "ring-2 ring-white/70",
										)}
										initial={reduce ? false : { height: 0 }}
										animate={{ height: Math.max(4, (v / top) * BAR_H) }}
										transition={{
											delay: reduce ? 0 : 0.05 * i,
											type: "spring",
											stiffness: 160,
											damping: 20,
										}}
									/>
								</button>
							</li>
						);
					})}
				</ol>
			</div>
			<ol
				className="mt-1.5 grid grid-cols-7 gap-2 text-center text-[0.7rem] text-plum-200"
				aria-hidden="true"
			>
				{days.map((d) => (
					<li key={d} className={cn(d === today && "font-bold text-marigold")}>
						{d === today ? t("Today") : formatDay(d, { weekday: "short" })}
					</li>
				))}
			</ol>
			{line !== null && (
				<p className="mt-2 flex items-center gap-1.5 text-[0.72rem] text-plum-200">
					<span
						className="w-4 border-t border-dashed border-white/50"
						aria-hidden="true"
					/>
					{t("Your daily amount, {amount}", { amount: money(dailyMinor) })}
				</p>
			)}
		</figure>
	);
}
