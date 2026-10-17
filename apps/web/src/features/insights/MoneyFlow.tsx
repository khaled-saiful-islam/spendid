import { formatMinor, type Wrapped } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { categoriesQuery } from "@/lib/money-api";

type GroupKey = "need" | "want" | "saved" | "free";

const GROUP: Record<GroupKey, { label: string; color: string }> = {
	need: { label: "Needs", color: "var(--color-jade)" },
	want: { label: "Wants", color: "var(--color-sky)" },
	saved: { label: "Kept for savings", color: "var(--color-marigold)" },
	free: { label: "Not spent yet", color: "var(--color-plum-300)" },
};

const KIND_GROUP = { need: "need", want: "want", saving: "saved" } as const;

/** Categories shown before "Show all". */
const TOP = 6;

/**
 * Where the month's money went: one bar for what came in (needs, wants, savings kept aside,
 * not spent yet), then every category ranked biggest first. Tap a category for its expenses.
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
	const { data: categories = [] } = useQuery(categoriesQuery);
	const [showAll, setShowAll] = useState(false);
	const money = (m: number) => formatMinor(m, data.currency);

	const sumOf = (k: "need" | "want" | "saving") =>
		data.flow.filter((c) => c.kind === k).reduce((n, c) => n + c.minor, 0);
	const needs = sumOf("need");
	const wants = sumOf("want");
	const savedMinor = reservedMinor + sumOf("saving");
	const spent = data.flow.reduce((n, c) => n + c.minor, 0);
	const income = Math.max(incomeMinor ?? 0, needs + wants + savedMinor);
	const free = Math.max(0, income - needs - wants - savedMinor);
	if (data.flow.length === 0 || income <= 0) return null;

	const groups = (
		[
			{ key: "need", minor: needs },
			{ key: "want", minor: wants },
			{ key: "saved", minor: savedMinor },
			{ key: "free", minor: free },
		] as { key: GroupKey; minor: number }[]
	).filter((g) => g.minor > 0);
	const pct = (m: number, of: number) =>
		Math.round((m / Math.max(1, of)) * 100);
	const ranked = [...data.flow].sort((a, b) => b.minor - a.minor);
	const shown = showAll ? ranked : ranked.slice(0, TOP);
	const biggest = ranked[0]?.minor ?? 1;
	const idOf = new Map(categories.map((c) => [c.name, c.id]));

	return (
		<section
			aria-labelledby="flow-title"
			className="rounded-panel border border-line bg-surface p-4 sm:p-5"
		>
			<h2 id="flow-title" className="text-[1.1rem] font-bold">
				{t("Where your money flowed")}
			</h2>
			<p data-money className="text-[0.9rem] text-ink-soft">
				{t("{amount} came in this month.", { amount: money(income) })}
			</p>

			<div
				className="mt-3 flex h-4 gap-[2px] overflow-hidden rounded-full"
				role="img"
				aria-label={groups
					.map(
						(g) =>
							`${t(GROUP[g.key].label)}: ${money(g.minor)} (${pct(g.minor, income)}%)`,
					)
					.join(", ")}
			>
				{groups.map((g, i) => (
					<motion.span
						key={g.key}
						title={`${t(GROUP[g.key].label)}: ${money(g.minor)}`}
						className="h-full first:rounded-l-full last:rounded-r-full"
						style={{ background: GROUP[g.key].color }}
						initial={reduce ? false : { flexGrow: 0 }}
						animate={{ flexGrow: g.minor }}
						transition={{ delay: reduce ? 0 : i * 0.08, duration: 0.6 }}
					/>
				))}
			</div>
			<ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
				{groups.map((g) => (
					<li key={g.key} className="min-w-0">
						<span className="flex items-center gap-1.5 text-[0.82rem] text-ink-soft">
							<span
								className="size-2.5 shrink-0 rounded-full"
								style={{ background: GROUP[g.key].color }}
								aria-hidden="true"
							/>
							{t(GROUP[g.key].label)}
						</span>
						<span data-money className="num block text-[0.92rem] font-semibold">
							{money(g.minor)}{" "}
							<span className="font-normal text-ink-soft">
								{pct(g.minor, income)}%
							</span>
						</span>
					</li>
				))}
			</ul>

			<div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-4">
				<h3 className="font-sans text-[0.95rem] font-semibold">
					{t("By category")}
				</h3>
				<p data-money className="num text-[0.85rem] text-ink-soft">
					{t("{amount} spent", { amount: money(spent) })}
				</p>
			</div>
			<ol className="mt-1">
				{shown.map((c, i) => {
					const id = idOf.get(c.name);
					const row = (
						<>
							<span className="flex items-baseline justify-between gap-3">
								<span className="min-w-0 font-medium break-words">
									<span className="num mr-1.5 text-ink-soft">{i + 1}</span>
									{t(c.name)}
								</span>
								<span data-money className="num shrink-0 text-[0.92rem]">
									<strong>{money(c.minor)}</strong>{" "}
									<span className="text-ink-soft">{pct(c.minor, spent)}%</span>
								</span>
							</span>
							<span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
								<motion.span
									className="block h-full rounded-full"
									style={{ background: GROUP[KIND_GROUP[c.kind]].color }}
									initial={reduce ? false : { width: 0 }}
									animate={{ width: `${(c.minor / biggest) * 100}%` }}
									transition={{ delay: reduce ? 0 : 0.04 * i, duration: 0.5 }}
								/>
							</span>
						</>
					);
					return (
						<li key={c.name}>
							{id ? (
								<Link
									to="/app/activity"
									search={{ category: id }}
									className="group flex items-center gap-2 rounded-tile px-2 py-2 hover:bg-surface-2"
								>
									<span className="min-w-0 flex-1">{row}</span>
									<span className="sr-only">{t("See these expenses")}</span>
									<ChevronRight
										className="size-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5"
										aria-hidden="true"
									/>
								</Link>
							) : (
								<div className="px-2 py-2">{row}</div>
							)}
						</li>
					);
				})}
			</ol>
			{ranked.length > TOP && (
				<button
					type="button"
					aria-expanded={showAll}
					onClick={() => setShowAll((v) => !v)}
					className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[0.9rem] font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink"
				>
					<ChevronDown
						className={cn(
							"size-4 transition-transform",
							showAll && "rotate-180",
						)}
						aria-hidden="true"
					/>
					{showAll
						? t("Show fewer")
						: t("Show all {n} categories", { n: ranked.length })}
				</button>
			)}
		</section>
	);
}
