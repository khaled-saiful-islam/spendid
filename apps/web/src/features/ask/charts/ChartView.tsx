import { type ChartSpec, formatMinor } from "@spendid/shared";
import { Table2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type PointerEvent, useId, useState } from "react";
import { cn } from "@/lib/cn";

/** Ranked horizontal bars: magnitude in one hue; labels and values in text colours. */
function Bars({ chart }: { chart: ChartSpec }) {
	const reduce = useReducedMotion();
	const max = Math.max(...chart.points.map((p) => Math.abs(p.value)), 1);
	return (
		<ul className="space-y-2.5">
			{chart.points.map((p, i) => (
				<li
					key={p.label}
					className="grid grid-cols-[minmax(0,7.5rem)_1fr_6.5rem] items-center gap-3 text-[0.9rem]"
				>
					<span className="break-words text-ink-soft">{p.label}</span>
					<span className="h-3 rounded-r-[4px] bg-surface-2">
						<motion.span
							className="block h-full rounded-r-[4px] bg-[var(--chart-1)]"
							initial={{
								width: reduce ? `${(Math.abs(p.value) / max) * 100}%` : 0,
							}}
							animate={{ width: `${(Math.abs(p.value) / max) * 100}%` }}
							transition={{
								delay: i * 0.05,
								type: "spring",
								stiffness: 90,
								damping: 18,
							}}
						/>
					</span>
					<span className="num font-semibold text-ink">
						{formatMinor(p.value, chart.currency)}
					</span>
				</li>
			))}
		</ul>
	);
}

const W = 320;
const H = 140;
const PAD = { l: 8, r: 8, t: 12, b: 22 };

/** One 2px line with a soft area and a crosshair tooltip that follows the pointer. */
function Line({ chart }: { chart: ChartSpec }) {
	const gradient = useId();
	const [active, setActive] = useState<number | null>(null);
	const values = chart.points.map((p) => p.value);
	const max = Math.max(...values, 1);
	const step =
		chart.points.length > 1
			? (W - PAD.l - PAD.r) / (chart.points.length - 1)
			: 0;
	const x = (i: number) => PAD.l + i * step;
	const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
	const line = chart.points
		.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`)
		.join(" ");
	const area = `${line} L${x(chart.points.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`;
	const point = active === null ? null : chart.points[active];

	const onMove = (e: PointerEvent<SVGSVGElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		const rel = ((e.clientX - box.left) / box.width) * W;
		setActive(
			Math.max(
				0,
				Math.min(
					chart.points.length - 1,
					Math.round((rel - PAD.l) / (step || 1)),
				),
			),
		);
	};

	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full touch-none"
				onPointerMove={onMove}
				onPointerDown={onMove}
				onPointerLeave={() => setActive(null)}
				role="img"
				aria-label={chart.title}
			>
				<defs>
					<linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.22" />
						<stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
					</linearGradient>
				</defs>
				<line
					x1={PAD.l}
					x2={W - PAD.r}
					y1={H - PAD.b}
					y2={H - PAD.b}
					stroke="var(--line)"
					strokeWidth="1"
				/>
				<path d={area} fill={`url(#${gradient})`} />
				<motion.path
					d={line}
					fill="none"
					stroke="var(--chart-1)"
					strokeWidth="2"
					strokeLinejoin="round"
					strokeLinecap="round"
					initial={{ pathLength: 0 }}
					animate={{ pathLength: 1 }}
					transition={{ duration: 0.8 }}
				/>
				{active !== null && point && (
					<>
						<line
							x1={x(active)}
							x2={x(active)}
							y1={PAD.t}
							y2={H - PAD.b}
							stroke="var(--ink-soft)"
							strokeOpacity=".4"
							strokeWidth="1"
						/>
						<circle
							cx={x(active)}
							cy={y(point.value)}
							r="5"
							fill="var(--chart-1)"
							stroke="var(--surface)"
							strokeWidth="2"
						/>
					</>
				)}
				<text x={PAD.l} y={H - 6} fontSize="10" fill="var(--ink-soft)">
					{chart.points[0]?.label}
				</text>
				<text
					x={W - PAD.r}
					y={H - 6}
					fontSize="10"
					fill="var(--ink-soft)"
					textAnchor="end"
				>
					{chart.points.at(-1)?.label}
				</text>
			</svg>
			{point && (
				<div className="pointer-events-none absolute top-0 right-0 rounded-tile bg-plum-900 px-3 py-1.5 text-[0.85rem] text-plum-50 shadow-lift dark:bg-plum-50 dark:text-plum-900">
					<span className="block text-[0.75rem] opacity-80">{point.label}</span>
					<span className="num font-bold">
						{formatMinor(point.value, chart.currency)}
					</span>
				</div>
			)}
		</div>
	);
}

/** A chart from the assistant, with a "show numbers" table for accessibility. */
export function ChartView({ chart }: { chart: ChartSpec }) {
	const [table, setTable] = useState(false);
	return (
		<figure className="rounded-panel border border-line bg-surface p-4">
			<div className="mb-3 flex items-start justify-between gap-3">
				<figcaption className="font-display text-[1.05rem] font-bold">
					{chart.title}
				</figcaption>
				<button
					type="button"
					onClick={() => setTable((t) => !t)}
					aria-pressed={table}
					className={cn(
						"inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8rem] font-medium",
						table ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink",
					)}
				>
					<Table2 className="size-4" aria-hidden="true" />{" "}
					{table ? "Show chart" : "Show numbers"}
				</button>
			</div>
			{table ? (
				<table className="w-full text-[0.9rem]">
					<tbody>
						{chart.points.map((p) => (
							<tr key={p.label} className="border-b border-line last:border-0">
								<th
									scope="row"
									className="py-1.5 text-left font-normal text-ink-soft"
								>
									{p.label}
								</th>
								<td className="num py-1.5 text-right font-semibold">
									{formatMinor(p.value, chart.currency)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : chart.kind === "bar" ? (
				<Bars chart={chart} />
			) : (
				<Line chart={chart} />
			)}
		</figure>
	);
}
