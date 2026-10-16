import { formatMinor, type Heatmap as HeatmapData } from "@spendid/shared";
import { List, Table } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";

const LEVELS = 5;
/** Monday-first weekday initials. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
	new Date(`${day}T12:00`).toLocaleDateString(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});

/** A month as a calendar where darker days cost more. Tap a day for its total; a list view is one tap away. */
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
				<figcaption className="font-semibold">Spending by day</figcaption>
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
					{asList ? "Show calendar" : "Show as list"}
				</button>
			</div>
			{asList ? (
				<ul className="divide-y divide-line rounded-tile border border-line">
					{data.days.length === 0 && (
						<li className="p-3 text-ink-soft">No spending this month.</li>
					)}
					{[...data.days]
						.sort((a, b) => a.day.localeCompare(b.day))
						.map((d) => (
							<li
								key={d.day}
								className="flex flex-wrap justify-between gap-x-4 px-3 py-2"
							>
								<span>{longDay(d.day)}</span>
								<span className="num font-semibold">
									{money(d.minor)},{" "}
									{d.count === 1 ? "1 expense" : `${d.count} expenses`}
								</span>
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
									aria-label={`${longDay(day)}: ${entry ? `${money(entry.minor)}, ${entry.count} expenses` : future ? "not yet" : "no spending"}`}
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
								? `${longDay(picked)}: ${chosen ? `${money(chosen.minor)}, ${chosen.count === 1 ? "1 expense" : `${chosen.count} expenses`}` : "no spending"}`
								: "Tap a day to see its total."}
						</p>
						<span className="flex items-center gap-1.5" aria-hidden="true">
							Less
							{Array.from({ length: LEVELS }, (_, i) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: the five legend steps never change
									key={i}
									className="size-3.5 rounded-[0.25rem]"
									style={{ background: `var(--heat-${i + 1})` }}
								/>
							))}
							More
						</span>
					</div>
				</>
			)}
		</figure>
	);
}
