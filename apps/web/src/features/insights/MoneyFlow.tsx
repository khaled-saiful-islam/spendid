import { formatMinor, type Wrapped } from "@spendid/shared";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";

type GroupKey = "need" | "want" | "saved" | "free";

const GROUP: Record<GroupKey, { label: string; color: string }> = {
	need: { label: "Needs", color: "var(--color-jade)" },
	want: { label: "Wants", color: "var(--color-sky)" },
	saved: { label: "Kept for savings", color: "var(--color-marigold)" },
	free: { label: "Not spent yet", color: "var(--color-plum-300)" },
};

const MAX_CATEGORIES = 6;
const GAP = 6;
const MIN_GROUP = 30;
const MIN_LEAF = 34;

interface Node {
	key: string;
	label: string;
	minor: number;
	color: string;
	y: number;
	h: number;
	group?: GroupKey;
}

/** Heights proportional to value, with a minimum so every label fits, filling `total` px. */
function stack<T extends { minor: number }>(
	items: T[],
	total: number,
	min: number,
): (T & { y: number; h: number })[] {
	const room = total - GAP * Math.max(0, items.length - 1);
	const sum = items.reduce((n, i) => n + i.minor, 0) || 1;
	let heights = items.map((i) => (i.minor / sum) * room);
	const small = heights.filter((h) => h < min).length;
	if (small) {
		const bigSum =
			items.reduce(
				(n, i, k) => n + ((heights[k] ?? 0) >= min ? i.minor : 0),
				0,
			) || 1;
		const left = room - small * min;
		heights = items.map((i, k) =>
			(heights[k] ?? 0) < min ? min : (i.minor / bigSum) * left,
		);
	}
	let y = 0;
	return items.map((i, k) => {
		const h = heights[k] ?? min;
		const out = { ...i, y, h };
		y += h + GAP;
		return out;
	});
}

/** A ribbon from a slice of one node to a slice of another (x in 0–100, y in px). */
function ribbon(
	x1: number,
	a1: number,
	b1: number,
	x2: number,
	a2: number,
	b2: number,
): string {
	const m = (x1 + x2) / 2;
	return `M${x1} ${a1} C${m} ${a1} ${m} ${a2} ${x2} ${a2} L${x2} ${b2} C${m} ${b2} ${m} ${b1} ${x1} ${b1} Z`;
}

/**
 * Where the month's money went, as a flow: income into needs, wants, savings kept aside and
 * what's not spent yet, then into the categories. Tap any part for its numbers.
 */
export function MoneyFlow({
	data,
	incomeMinor,
	reservedMinor,
}: {
	data: Wrapped;
	incomeMinor: number | null;
	reservedMinor: number;
}) {
	const reduce = useReducedMotion();
	const [active, setActive] = useState<string | null>(null);
	const money = (m: number) => formatMinor(m, data.currency);

	const byKind = (k: "need" | "want" | "saving") =>
		data.flow.filter((c) => c.kind === k);
	const sum = (xs: { minor: number }[]) => xs.reduce((n, x) => n + x.minor, 0);
	const needs = byKind("need");
	const wants = byKind("want");
	const savedSpend = sum(byKind("saving"));
	const savedMinor = reservedMinor + savedSpend;
	const spent = sum(needs) + sum(wants);
	const income = Math.max(incomeMinor ?? 0, spent + savedMinor);
	const free = Math.max(0, income - spent - savedMinor);
	if (data.flow.length === 0 || income <= 0) return null;

	const groups = (
		[
			{ key: "need", minor: sum(needs) },
			{ key: "want", minor: sum(wants) },
			{ key: "saved", minor: savedMinor },
			{ key: "free", minor: free },
		] as { key: GroupKey; minor: number }[]
	).filter((g) => g.minor > 0);

	// Categories under needs and wants; the smallest fold into "Everything else" per group.
	const leaves: {
		key: string;
		label: string;
		minor: number;
		group: GroupKey;
	}[] = [];
	for (const [group, cats] of [
		["need", needs],
		["want", wants],
	] as const) {
		const share = Math.max(
			1,
			Math.round((MAX_CATEGORIES * sum(cats)) / Math.max(1, spent)),
		);
		const shown = cats.slice(0, share);
		const rest = sum(cats.slice(share));
		for (const c of shown)
			leaves.push({
				key: `${group}:${c.name}`,
				label: c.name,
				minor: c.minor,
				group,
			});
		if (rest > 0)
			leaves.push({
				key: `${group}:rest`,
				label: t("Everything else"),
				minor: rest,
				group,
			});
	}

	const H = Math.max(300, leaves.length * (MIN_LEAF + GAP));
	const mid = stack(groups, H, MIN_GROUP).map(
		(g): Node => ({
			key: g.key,
			label: t(GROUP[g.key].label),
			minor: g.minor,
			color: GROUP[g.key].color,
			y: g.y,
			h: g.h,
			group: g.key,
		}),
	);
	const right = stack(leaves, H, MIN_LEAF).map(
		(l): Node => ({
			key: l.key,
			label: t(l.label),
			minor: l.minor,
			color: GROUP[l.group].color,
			y: l.y,
			h: l.h,
			group: l.group,
		}),
	);

	// Income slices line up with the middle nodes, in order.
	let inY = 0;
	const inRibbons = mid.map((g) => {
		const h = (g.minor / income) * H;
		const r: { key: string; d: string; color: string; group?: string } = {
			key: g.key,
			d: ribbon(4, inY, inY + h, 40, g.y, g.y + g.h),
			color: g.color,
		};
		inY += h;
		return r;
	});
	// Each group's slices line up with its categories.
	const outRibbons = mid.flatMap((g) => {
		let y = g.y;
		return right
			.filter((l) => l.group === g.group)
			.map((l) => {
				const h = (l.minor / Math.max(1, g.minor)) * g.h;
				const r = {
					key: l.key,
					d: ribbon(44, y, y + h, 62, l.y, l.y + l.h),
					color: l.color,
					group: g.key,
				};
				y += h;
				return r;
			});
	});

	const picked = [...mid, ...right].find((n) => n.key === active);
	const pct = (m: number) => Math.round((m / income) * 100);
	const dim = (key: string, group?: string) =>
		active !== null && active !== key && active !== group;

	return (
		<section
			aria-labelledby="flow-title"
			className="rounded-panel border border-line bg-surface p-4 sm:p-6"
		>
			<h2 id="flow-title" className="text-[1.6rem] font-bold">
				{t("Where your money flowed")}
			</h2>
			<p data-money className="mt-1 text-ink-soft">
				{t("{amount} came in. Tap any part to see it.", {
					amount: money(income),
				})}
			</p>

			<div className="relative mt-5" style={{ height: H }} aria-hidden="true">
				<svg
					viewBox={`0 0 100 ${H}`}
					aria-hidden="true"
					preserveAspectRatio="none"
					className="absolute inset-0 size-full overflow-visible"
				>
					<rect
						x="0"
						y="0"
						width="4"
						height={H}
						rx="1"
						fill="var(--color-plum-500)"
					/>
					{[...inRibbons, ...outRibbons].map((r, i) => (
						<motion.path
							key={r.key + (i < inRibbons.length ? "-in" : "-out")}
							d={r.d}
							fill={r.color}
							initial={reduce ? false : { opacity: 0 }}
							animate={{
								opacity: dim(r.key, r.group) ? 0.12 : 0.42,
							}}
							transition={{ delay: reduce ? 0 : 0.05 * i, duration: 0.5 }}
							onPointerEnter={() => setActive(r.key)}
							onPointerLeave={() => setActive(null)}
							onClick={() => setActive(r.key)}
						/>
					))}
					{mid.map((g) => (
						<rect
							key={g.key}
							x="40"
							y={g.y}
							width="4"
							height={g.h}
							rx="1"
							fill={g.color}
						/>
					))}
					{right.map((l) => (
						<rect
							key={l.key}
							x="62"
							y={l.y}
							width="2.5"
							height={l.h}
							rx="1"
							fill={l.color}
							opacity={dim(l.key, l.group) ? 0.3 : 1}
						/>
					))}
				</svg>
				{/* Labels are HTML so they wrap instead of being cut off. */}
				{mid.map((g) => (
					<span
						key={g.key}
						data-money
						className="absolute right-[57%] left-[5%] flex flex-col items-end justify-center pr-2 text-right leading-tight"
						style={{ top: g.y, height: g.h }}
					>
						<span className="rounded bg-surface/85 px-1 text-[0.78rem] font-bold">
							{g.label}
						</span>
						<span className="num rounded bg-surface/85 px-1 text-[0.74rem] text-ink-soft">
							{pct(g.minor)}%
						</span>
					</span>
				))}
				{right.map((l) => (
					<span
						key={l.key}
						data-money
						className={cn(
							"absolute right-0 left-[calc(64.5%+6px)] flex flex-col justify-center leading-tight",
							dim(l.key, l.group) && "opacity-40",
						)}
						style={{ top: l.y, height: l.h }}
					>
						<span className="text-[0.8rem] font-semibold break-words">
							{l.label}
						</span>
						<span className="num text-[0.74rem] text-ink-soft">
							{money(l.minor)}
						</span>
					</span>
				))}
			</div>

			<p data-money className="mt-4 min-h-6 font-semibold" aria-live="polite">
				{picked
					? t("{name}: {amount}, {pct}% of what came in.", {
							name: picked.label,
							amount: money(picked.minor),
							pct: pct(picked.minor),
						})
					: t(
							"Needs {needs}, wants {wants}, savings {saved}, not spent yet {free}.",
							{
								needs: money(sum(needs)),
								wants: money(sum(wants)),
								saved: money(savedMinor),
								free: money(free),
							},
						)}
			</p>

			<ul className="sr-only">
				{mid.map((g) => (
					<li key={g.key}>
						{g.label}: {money(g.minor)} ({pct(g.minor)}%)
						<ul>
							{right
								.filter((l) => l.group === g.group)
								.map((l) => (
									<li key={l.key}>
										{l.label}: {money(l.minor)}
									</li>
								))}
						</ul>
					</li>
				))}
			</ul>
		</section>
	);
}
