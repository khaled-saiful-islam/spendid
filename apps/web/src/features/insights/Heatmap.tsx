import { formatMinor, type Heatmap as HeatmapData } from "@spendid/shared";
import { List, Table } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { dateLocale, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/time";
import { DayExpensesSheet } from "./DayExpenses";

const LEVELS = 5;
/** Monday-first short weekday names in the app language (1 Jan 2024 was a Monday). */
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
	new Date(2024, 0, 1 + i).toLocaleDateString(dateLocale(), {
		weekday: "short",
	}),
);

function levelOf(minor: number, max: number): number {
	if (minor <= 0 || max <= 0) return 0;
	return Math.min(LEVELS, Math.max(1, Math.ceil((minor / max) * LEVELS)));
}

const cellStyle = (level: number) =>
	level === 0
		? undefined
		: {
				background: `var(--heat-${level})`,
				color: level <= 2 ? "var(--heat-ink-low)" : "var(--heat-ink-high)",
			};

const longDay = (day: string) =>
	formatDay(day, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});

/** A month as a calendar where darker days cost more. Tap a day for its expenses; a list view is one tap away. */
export function Heatmap({ data }: { data: HeatmapData }) {
	const reduce = useReducedMotion();
	const [picked, setPicked] = useState<string | null>(null);
	const [asList, setAsList] = useState(false);
	const byDay = new Map(data.days.map((d) => [d.day, d]));
	const [y, m] = data.month.split("-").map(Number) as [number, number];
	const daysInMonth = new Date(y, m, 0).getDate();
	const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
	const money = (minor: number) => formatMinor(minor, data.currency);
	const chosen = picked ? byDay.get(picked) : null;

	return (
		<figure className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<figcaption className="font-semibold">
					{t("Spending by day")}
				</figcaption>
				<button
					type="button"
					onClick={() => setAsList((v) => !v)}
					className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[0.9rem] font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink"
				>
					{asList ? (
						<Table className="size-4" aria-hidden="true" />
					) : (
						<List className="size-4" aria-hidden="true" />
					)}
					{asList ? t("Show calendar") : t("Show as list")}
				</button>
			</div>
			{asList ? (
				<ul className="divide-y divide-line rounded-tile border border-line">
					{data.days.length === 0 && (
						<li className="p-3 text-ink-soft">
							{t("No spending this month.")}
						</li>
					)}
					{[...data.days]
						.sort((a, b) => b.day.localeCompare(a.day))
						.map((d) => (
							<li key={d.day}>
								<button
									type="button"
									aria-pressed={d.day === picked}
									onClick={() => setPicked(d.day === picked ? null : d.day)}
									className={cn(
										"flex w-full flex-wrap justify-between gap-x-4 px-3 py-2 text-left hover:bg-surface-2",
										d.day === picked && "bg-plum-500/10",
									)}
								>
									<span>{longDay(d.day)}</span>
									<span className="num font-semibold">
										{t(
											d.count === 1
												? "{amount}, 1 expense"
												: "{amount}, {n} expenses",
											{ amount: money(d.minor), n: d.count },
										)}
									</span>
								</button>
							</li>
						))}
				</ul>
			) : (
				<>
					<div
						className="grid grid-cols-7 gap-1.5 text-center text-[0.75rem] font-semibold text-ink-soft"
						aria-hidden="true"
					>
						{WEEKDAYS.map((w) => (
							<span key={w}>{w}</span>
						))}
					</div>
					<div className="grid grid-cols-7 gap-1.5">
						{Array.from({ length: lead }, (_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: blank cells before day 1, fixed positions
							<span key={`lead-${i}`} aria-hidden="true" />
						))}
						{Array.from({ length: daysInMonth }, (_, i) => {
							const day = `${data.month}-${String(i + 1).padStart(2, "0")}`;
							const entry = byDay.get(day);
							const level = levelOf(entry?.minor ?? 0, data.maxMinor);
							const future = day > data.today;
							return (
								<motion.button
									key={day}
									type="button"
									disabled={future}
									onClick={() => setPicked(day === picked ? null : day)}
									aria-pressed={day === picked}
									aria-label={`${longDay(day)}: ${entry ? t("{amount}, {n} expenses", { amount: money(entry.minor), n: entry.count }) : future ? t("not yet") : t("no spending")}`}
									initial={reduce ? false : { opacity: 0, scale: 0.6 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ delay: reduce ? 0 : i * 0.012 }}
									style={cellStyle(level)}
									className={cn(
										"num grid aspect-square place-items-center rounded-[0.6rem] text-[0.85rem] font-semibold transition-shadow",
										level === 0 &&
											(future
												? "border border-dashed border-line text-ink-soft/50"
												: "bg-surface-2 text-ink-soft"),
										day === picked &&
											"ring-3 ring-marigold ring-offset-2 ring-offset-surface",
										day === data.today &&
											"outline-2 outline-offset-1 outline-plum-500",
									)}
								>
									{i + 1}
								</motion.button>
							);
						})}
					</div>
					<div className="flex flex-wrap items-center justify-between gap-3 text-[0.85rem] text-ink-soft">
						<p aria-live="polite" className="font-semibold text-ink">
							{picked
								? `${longDay(picked)}: ${chosen ? t(chosen.count === 1 ? "{amount}, 1 expense" : "{amount}, {n} expenses", { amount: money(chosen.minor), n: chosen.count }) : t("no spending")}`
								: t("Tap a day to see its expenses.")}
						</p>
						<span className="flex items-center gap-1.5" aria-hidden="true">
							{t("Less")}
							{Array.from({ length: LEVELS }, (_, i) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: the five legend steps never change
									key={i}
									className="size-3.5 rounded-[0.25rem]"
									style={{ background: `var(--heat-${i + 1})` }}
								/>
							))}
							{t("More")}
						</span>
					</div>
				</>
			)}
			<DayExpensesSheet
				day={picked}
				currency={data.currency}
				onClose={() => setPicked(null)}
			/>
		</figure>
	);
}
