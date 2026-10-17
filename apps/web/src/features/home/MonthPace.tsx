import {
	formatMinor,
	goalWeeksSooner,
	monthPace,
	type Pace,
	type Summary,
	toMinor,
	whatIf,
} from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { dateLocale, t } from "@/i18n";
import { heatmapQuery, thisMonth } from "@/lib/insights-api";
import { goalsQuery } from "@/lib/money-api";

const W = 320;
const H = 150;
const PAD = { l: 6, r: 6, t: 14, b: 18 };

/** Where the month is heading: spent so far vs an even pace, the forecast, and a what-if. */
export function MonthPace({ summary }: { summary: Summary }) {
	const month = thisMonth();
	const { data: heat } = useQuery(heatmapQuery(month));
	const { data: goals = [] } = useQuery(goalsQuery);
	const [cut, setCut] = useState(0);
	const sliderId = useId();
	if (!heat || summary.incomeMinor === null) return null;

	const cur = summary.homeCurrency;
	const money = (m: number) => formatMinor(m, cur);
	const todayN = Number(heat.today.slice(8, 10));
	const [y, m] = month.split("-").map(Number) as [number, number];
	const daysInMonth = new Date(y, m, 0).getDate();
	const byDay = new Map(
		heat.days.map((d) => [Number(d.day.slice(8, 10)), d.minor]),
	);
	const pace = monthPace({
		budgetMinor: summary.incomeMinor - summary.reservedMinor,
		dailyMinor: Array.from({ length: todayN }, (_, i) => byDay.get(i + 1) ?? 0),
		daysInMonth,
		billsDueMinor: summary.bills.minor,
	});
	const daysAfter = daysInMonth - todayN;
	const maxCut = Math.max(10, Math.ceil(pace.perDayMinor / 100 / 5) * 5);
	const scenario = whatIf(pace, daysAfter, toMinor(cut, cur));
	const goal = goals.find((g) => g.targetDate && g.savedMinor < g.targetMinor);
	const sooner = goal ? goalWeeksSooner(goal, toMinor(cut, cur) * 30) : null;
	const monthName = new Date(y, m - 1, 1).toLocaleDateString(dateLocale(), {
		month: "long",
	});

	const headline =
		pace.runsOutOn !== null
			? t("At this pace, the money runs out around {date}.", {
					date: new Date(y, m - 1, pace.runsOutOn).toLocaleDateString(
						dateLocale(),
						{
							day: "numeric",
							month: "short",
						},
					),
				})
			: t("At this pace, you'll finish {month} with {amount} to spare.", {
					month: monthName,
					amount: money(pace.landingMinor),
				});

	return (
		<section
			aria-labelledby="pace-title"
			className="rounded-panel border border-line bg-surface p-5 sm:p-6"
		>
			<h2 id="pace-title" className="text-[1.3rem] font-bold">
				{t("Where your month is heading")}
			</h2>
			<p data-money className="mt-1 text-[1.05rem] font-semibold">
				{headline}
			</p>
			<p data-money className="mt-1 text-[0.92rem] text-ink-soft">
				{pace.vsEvenMinor <= 0
					? t("{amount} under an even pace so far, about {daily} a day.", {
							amount: money(-pace.vsEvenMinor),
							daily: money(pace.perDayMinor),
						})
					: t("{amount} over an even pace so far, about {daily} a day.", {
							amount: money(pace.vsEvenMinor),
							daily: money(pace.perDayMinor),
						})}
			</p>

			<PaceChart
				pace={pace}
				daysInMonth={daysInMonth}
				todayN={todayN}
				money={money}
			/>

			<div className="mt-5 rounded-tile bg-surface-2 p-4">
				<label
					htmlFor={sliderId}
					className="flex flex-wrap items-baseline justify-between gap-2 font-semibold"
				>
					<span>{t("What if I spent less each day?")}</span>
					<span className="num text-plum-500">
						{cut === 0
							? t("Same as now")
							: t("{amount} less a day", { amount: money(toMinor(cut, cur)) })}
					</span>
				</label>
				<input
					id={sliderId}
					type="range"
					min={0}
					max={maxCut}
					step={5}
					value={cut}
					onChange={(e) => setCut(Number(e.target.value))}
					className="mt-3 w-full accent-plum-500"
				/>
				<motion.p
					key={cut}
					initial={{ opacity: 0.4 }}
					animate={{ opacity: 1 }}
					data-money
					className="mt-2"
				>
					{cut === 0
						? t(
								"Slide to see how a small change adds up by the end of the month.",
							)
						: scenario.landingMinor >= 0
							? t(
									"You'd finish with {amount} to spare, {extra} more than now.",
									{
										amount: money(scenario.landingMinor),
										extra: money(scenario.extraMinor),
									},
								)
							: t("You'd be {amount} short, {extra} better than now.", {
									amount: money(-scenario.landingMinor),
									extra: money(scenario.extraMinor),
								})}
				</motion.p>
				{cut > 0 && goal && sooner !== null && sooner > 0 && (
					<p className="mt-1 font-semibold text-safe">
						{t("Put it in {goal} and it arrives about {n} weeks sooner.", {
							goal: `${goal.emoji} ${goal.name}`,
							n: sooner,
						})}
					</p>
				)}
			</div>
		</section>
	);
}

/** Running total (solid), an even pace (dashed grey) and where it's heading (dashed). */
function PaceChart({
	pace,
	daysInMonth,
	todayN,
	money,
}: {
	pace: Pace;
	daysInMonth: number;
	todayN: number;
	money: (m: number) => string;
}) {
	const reduce = useReducedMotion();
	const [hover, setHover] = useState<number | null>(null);
	const top =
		Math.max(
			pace.even.at(-1) ?? 0,
			pace.forecast.at(-1) ?? 0,
			pace.spentMinor,
			1,
		) * 1.08;
	const x = (day: number) =>
		PAD.l + ((day - 1) / Math.max(1, daysInMonth - 1)) * (W - PAD.l - PAD.r);
	const yv = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
	const path = (pts: [number, number][]) =>
		pts
			.map(
				([d, v], i) => `${i ? "L" : "M"}${x(d).toFixed(1)} ${yv(v).toFixed(1)}`,
			)
			.join(" ");
	const actualPts = pace.actual.map((v, i) => [i + 1, v] as [number, number]);
	const evenPts = pace.even.map((v, i) => [i + 1, v] as [number, number]);
	const forecastPts = pace.forecast.map(
		(v, i) => [todayN + i, v] as [number, number],
	);
	const budget = pace.even.at(-1) ?? 0;
	const shown = hover ?? todayN;
	const valueAt = (d: number) =>
		d <= todayN ? (pace.actual[d - 1] ?? 0) : (pace.forecast[d - todayN] ?? 0);

	return (
		<figure className="mt-4">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full touch-none overflow-visible"
				role="img"
				aria-label={t(
					"Spending so far this month compared with an even pace, and where it's heading.",
				)}
				onPointerMove={(e) => {
					const box = e.currentTarget.getBoundingClientRect();
					const px = ((e.clientX - box.left) / box.width) * W;
					const d =
						Math.round(
							((px - PAD.l) / (W - PAD.l - PAD.r)) * (daysInMonth - 1),
						) + 1;
					setHover(Math.min(daysInMonth, Math.max(1, d)));
				}}
				onPointerLeave={() => setHover(null)}
			>
				<line
					x1={PAD.l}
					x2={W - PAD.r}
					y1={yv(budget)}
					y2={yv(budget)}
					stroke="var(--line)"
					strokeDasharray="2 4"
				/>
				<text
					x={W - PAD.r}
					y={yv(budget) - 4}
					textAnchor="end"
					fontSize="9"
					fill="var(--ink-soft)"
				>
					{money(budget)}
				</text>
				<path
					d={path(evenPts)}
					fill="none"
					stroke="var(--ink-soft)"
					strokeOpacity="0.55"
					strokeWidth="1.5"
					strokeDasharray="4 4"
				/>
				<motion.path
					d={path(forecastPts)}
					fill="none"
					stroke="var(--color-plum-500)"
					strokeOpacity="0.55"
					strokeWidth="2"
					strokeDasharray="5 4"
					initial={reduce ? false : { pathLength: 0 }}
					animate={{ pathLength: 1 }}
					transition={{ delay: 0.9, duration: 0.8 }}
				/>
				<motion.path
					d={path(actualPts)}
					fill="none"
					stroke="var(--color-plum-500)"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					initial={reduce ? false : { pathLength: 0 }}
					animate={{ pathLength: 1 }}
					transition={{ duration: 0.9, ease: "easeOut" }}
				/>
				<circle
					cx={x(todayN)}
					cy={yv(pace.spentMinor)}
					r="4.5"
					fill="var(--color-marigold)"
					stroke="var(--surface)"
					strokeWidth="2"
				/>
				{hover !== null && (
					<g>
						<line
							x1={x(hover)}
							x2={x(hover)}
							y1={PAD.t}
							y2={H - PAD.b}
							stroke="var(--ink-soft)"
							strokeOpacity="0.4"
						/>
						<circle
							cx={x(hover)}
							cy={yv(valueAt(hover))}
							r="3.5"
							fill="var(--color-plum-500)"
						/>
					</g>
				)}
				<text x={PAD.l} y={H - 4} fontSize="9" fill="var(--ink-soft)">
					1
				</text>
				<text
					x={W - PAD.r}
					y={H - 4}
					fontSize="9"
					fill="var(--ink-soft)"
					textAnchor="end"
				>
					{daysInMonth}
				</text>
			</svg>
			<figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.85rem] text-ink-soft">
				<span className="inline-flex items-center gap-1.5">
					<span className="h-0.5 w-5 rounded bg-plum-500" aria-hidden="true" />{" "}
					{t("Spent")}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span
						className="w-5 border-t-2 border-dashed border-plum-500/60"
						aria-hidden="true"
					/>{" "}
					{t("Heading to")}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span
						className="w-5 border-t-2 border-dashed border-ink-soft/50"
						aria-hidden="true"
					/>{" "}
					{t("Even pace")}
				</span>
				<span
					data-money
					className="num ml-auto font-semibold text-ink"
					aria-live="polite"
				>
					{t("Day {d}: {amount}", { d: shown, amount: money(valueAt(shown)) })}
					{shown > todayN ? ` ${t("(forecast)")}` : ""}
				</span>
			</figcaption>
		</figure>
	);
}
