import { formatMinor } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowUpRight,
	CalendarClock,
	Flame,
	Lock,
	PartyPopper,
	Target,
	TrendingUp,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { CategoryIcon, TINTS } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { heatmapQuery, recurringQuery, thisMonth } from "@/lib/insights-api";
import { categoriesQuery, goalsQuery, summaryQuery } from "@/lib/money-api";
import { appToday, formatDay } from "@/lib/time";
import { LogDemo } from "./LogDemo";

/** A tiny line of this month's daily spending: the shape, not just a total. */
function Sparkline({ values }: { values: number[] }) {
	if (values.length < 2) return null;
	const max = Math.max(...values, 1);
	const step = 100 / (values.length - 1);
	const points = values
		.map(
			(v, i) => `${(i * step).toFixed(2)},${(28 - (v / max) * 26).toFixed(2)}`,
		)
		.join(" ");
	return (
		<svg
			viewBox="0 0 100 30"
			preserveAspectRatio="none"
			className="mt-2 h-8 w-full text-orange-500 dark:text-marigold"
			aria-hidden="true"
		>
			<motion.polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
				initial={{ pathLength: 0 }}
				animate={{ pathLength: 1 }}
				transition={{ duration: 1.1, delay: 0.3 }}
			/>
		</svg>
	);
}

/** A share of something, as a short filled bar. */
function ShareBar({ pct, tint }: { pct: number; tint: string }) {
	return (
		<span className="mt-2.5 block h-2 overflow-hidden rounded-full bg-ink/10">
			<motion.span
				className={cn("block h-full rounded-full bg-linear-to-r", tint)}
				initial={{ width: 0 }}
				animate={{ width: `${Math.min(100, pct)}%` }}
				transition={{ duration: 0.8, delay: 0.3 }}
			/>
		</span>
	);
}

/**
 * A question with a preview of the real number behind it. The colour wash says which part
 * of your money it's about; tapping asks the question.
 */
function IdeaTile({
	tint,
	icon,
	label,
	value,
	visual,
	question,
	onAsk,
	index,
}: {
	tint: string;
	icon: ReactNode;
	label: string;
	value: ReactNode;
	visual?: ReactNode;
	question: string;
	onAsk: (q: string) => void;
	index: number;
}) {
	const reduce = useReducedMotion();
	return (
		<motion.li
			initial={reduce ? false : { opacity: 0, y: 14 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				delay: reduce ? 0 : 0.06 * index,
				type: "spring",
				stiffness: 220,
				damping: 22,
			}}
		>
			<button
				type="button"
				onClick={() => onAsk(question)}
				className="group relative flex h-full w-full flex-col overflow-hidden rounded-panel border border-line bg-surface p-4 text-left transition-transform hover:-translate-y-0.5"
			>
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute inset-0 bg-linear-to-br opacity-[0.16] transition-opacity group-hover:opacity-[0.24] dark:opacity-[0.13]",
						tint,
					)}
				/>
				<span className="relative flex items-center gap-2 text-[0.82rem] font-semibold text-ink-soft">
					{icon}
					<span className="min-w-0 break-words">{label}</span>
				</span>
				<span
					data-money
					className="num relative mt-2 block text-[1.35rem] leading-tight font-extrabold break-words"
				>
					{value}
				</span>
				{visual && <span className="relative block">{visual}</span>}
				<span className="relative mt-auto flex items-end justify-between gap-2 pt-3 text-[0.92rem] leading-snug font-semibold">
					<span className="min-w-0 break-words">{question}</span>
					<ArrowUpRight
						className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
						aria-hidden="true"
					/>
				</span>
			</button>
		</motion.li>
	);
}

/** A round badge for a tile's icon, filled with the tile's colour. */
function Badge({ tint, children }: { tint: string; children: ReactNode }) {
	return (
		<span
			className={cn(
				"grid size-7 shrink-0 place-items-center rounded-full bg-linear-to-br text-white shadow-sm",
				tint,
			)}
		>
			{children}
		</span>
	);
}

/** First screen: the question box, questions previewing this month's real numbers, two modes. */
export function AskWelcome({
	onAsk,
	onTone,
	composer,
}: {
	/** The question box, shown first. */
	composer?: ReactNode;
	onAsk: (q: string) => void;
	/** A roast of the month's spending, or a hype-up of its wins. */
	onTone: (tone: "roast" | "hype") => void;
}) {
	const { data: summary } = useQuery(summaryQuery);
	const { data: categories = [] } = useQuery(categoriesQuery);
	const { data: goals = [] } = useQuery(goalsQuery);
	const { data: recurring } = useQuery(recurringQuery);
	const { data: heat } = useQuery(heatmapQuery(thisMonth()));

	const cur = summary?.homeCurrency ?? "MYR";
	const money = (m: number) => formatMinor(m, cur);
	const top = [...(summary?.byCategory ?? [])].sort(
		(a, b) => b.spentMinor - a.spentMinor,
	)[0];
	const topCat = categories.find((c) => c.id === top?.categoryId);
	const topShare =
		top && summary?.monthSpentMinor
			? Math.round((top.spentMinor / summary.monthSpentMinor) * 100)
			: 0;
	const goal = goals.find((g) => g.savedMinor < g.targetMinor);
	const goalPct = goal
		? Math.round((goal.savedMinor / goal.targetMinor) * 100)
		: 0;
	const bills = recurring?.billsDue;
	const nextBill = bills?.items[0];
	const dayValues = heat
		? Array.from({ length: Number(heat.today.slice(8, 10)) }, (_, i) => {
				const day = `${heat.month}-${String(i + 1).padStart(2, "0")}`;
				return heat.days.find((d) => d.day === day)?.minor ?? 0;
			})
		: [];
	const monthLabel = formatDay(appToday(), { month: "long" });

	const tiles: ReactNode[] = [];
	if (summary && summary.monthSpentMinor > 0)
		tiles.push(
			<IdeaTile
				key="spent"
				index={tiles.length}
				onAsk={onAsk}
				tint={TINTS.amber ?? ""}
				icon={
					<Badge tint={TINTS.amber ?? ""}>
						<TrendingUp className="size-3.5" aria-hidden="true" />
					</Badge>
				}
				label={t("Spent in {month}", { month: monthLabel })}
				value={money(summary.monthSpentMinor)}
				visual={<Sparkline values={dayValues} />}
				question={t("Where did my {amount} go?", {
					amount: money(summary.monthSpentMinor),
				})}
			/>,
		);
	if (topCat && top)
		tiles.push(
			<IdeaTile
				key="top"
				index={tiles.length}
				onAsk={onAsk}
				tint={TINTS[topCat.tint] ?? TINTS.slate ?? ""}
				icon={
					<CategoryIcon
						icon={topCat.icon}
						tint={topCat.tint}
						size="sm"
						className="size-7"
					/>
				}
				label={t("Biggest category")}
				value={`${t(topCat.name)} ${topShare}%`}
				visual={
					<ShareBar
						pct={topShare}
						tint={TINTS[topCat.tint] ?? TINTS.slate ?? ""}
					/>
				}
				question={t("Why so much on {category}?", {
					category: t(topCat.name).toLowerCase(),
				})}
			/>,
		);
	if (bills && bills.items.length > 0 && nextBill)
		tiles.push(
			<IdeaTile
				key="bills"
				index={tiles.length}
				onAsk={onAsk}
				tint={TINTS.sky ?? ""}
				icon={
					<Badge tint={TINTS.sky ?? ""}>
						<CalendarClock className="size-3.5" aria-hidden="true" />
					</Badge>
				}
				label={t(
					bills.items.length === 1 ? "1 bill still due" : "{n} bills still due",
					{ n: bills.items.length },
				)}
				value={money(bills.minor)}
				visual={
					<span className="mt-1 block text-[0.85rem] text-ink-soft">
						{t("Next: {name}, {date}", {
							name: nextBill.merchant,
							date: formatDay(nextBill.day, { day: "numeric", month: "short" }),
						})}
					</span>
				}
				question={t("Which bills are still due this month?")}
			/>,
		);
	if (goal)
		tiles.push(
			<IdeaTile
				key="goal"
				index={tiles.length}
				onAsk={onAsk}
				tint={TINTS.lime ?? ""}
				icon={
					<Badge tint={TINTS.lime ?? ""}>
						<Target className="size-3.5" aria-hidden="true" />
					</Badge>
				}
				label={`${goal.emoji} ${goal.name}`}
				value={t("{pct}% saved", { pct: goalPct })}
				visual={<ShareBar pct={goalPct} tint={TINTS.lime ?? ""} />}
				question={t("Am I on track for {goal}?", { goal: goal.name })}
			/>,
		);

	return (
		<div className="space-y-4">
			{composer}

			<section aria-labelledby="ask-ideas">
				<h2 id="ask-ideas" className="sr-only">
					{t("Questions about your month")}
				</h2>
				<ul className="grid grid-cols-2 gap-3">
					{tiles}
					<li className="col-span-full">
						<LogDemo currency={cur} />
					</li>
				</ul>
			</section>

			<div className="grid grid-cols-2 gap-3">
				<motion.button
					type="button"
					whileHover={{ y: -2 }}
					whileTap={{ scale: 0.97 }}
					onClick={() => onTone("roast")}
					className="flex items-center gap-3 rounded-panel bg-linear-to-br from-coral to-[#ff8a3d] p-3.5 text-left text-plum-950 shadow-lift sm:p-4"
				>
					<Flame className="size-6 shrink-0" aria-hidden="true" />
					<span className="min-w-0">
						<span className="block font-extrabold">{t("Roast my month")}</span>
						<span className="block text-[0.82rem] leading-snug opacity-80">
							{t("Honest, funny, and with one tip")}
						</span>
					</span>
				</motion.button>
				<motion.button
					type="button"
					whileHover={{ y: -2 }}
					whileTap={{ scale: 0.97 }}
					onClick={() => onTone("hype")}
					className="flex items-center gap-3 rounded-panel bg-linear-to-br from-marigold to-[#ffd27a] p-3.5 text-left text-plum-950 shadow-lift sm:p-4"
				>
					<PartyPopper className="size-6 shrink-0" aria-hidden="true" />
					<span className="min-w-0">
						<span className="block font-extrabold">{t("Hype me up")}</span>
						<span className="block text-[0.82rem] leading-snug opacity-80">
							{t("Your real wins this month, cheered")}
						</span>
					</span>
				</motion.button>
			</div>

			<p className="flex items-start gap-2 px-1 text-[0.85rem] text-ink-soft">
				<Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
				{t(
					"Answers use only your own data. Chats are saved to your account, and only you can see them.",
				)}
			</p>
		</div>
	);
}
