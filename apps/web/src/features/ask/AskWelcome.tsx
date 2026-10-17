import { formatMinor } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowUpRight,
	CalendarClock,
	Flame,
	Lock,
	PartyPopper,
	PenLine,
	Target,
	Wallet,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { CategoryIcon, TINTS } from "@/components/money/CategoryIcon";
import { CountUp } from "@/components/money/CountUp";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { heatmapQuery, recurringQuery, thisMonth } from "@/lib/insights-api";
import { categoriesQuery, goalsQuery, summaryQuery } from "@/lib/money-api";
import { appToday, formatDay } from "@/lib/time";
import { SpendidCoin } from "./SpendidCoin";

const EXAMPLES = [
	"Where did my money go this week?",
	"Did I spend more on food than last month?",
	"How much is left for fun this month?",
	"Coffee 9 and parking 6 today",
];

/** Typewriter-style rotating example under the headline. */
function RotatingExample() {
	const reduce = useReducedMotion();
	const [i, setI] = useState(0);
	useEffect(() => {
		if (reduce) return;
		const t = setInterval(() => setI((n) => (n + 1) % EXAMPLES.length), 3200);
		return () => clearInterval(t);
	}, [reduce]);
	return (
		<p
			className="mt-2 min-h-14 text-[1.02rem] text-ink-soft sm:min-h-7"
			aria-hidden="true"
		>
			{t("Try")}{" "}
			<AnimatePresence mode="wait">
				<motion.span
					key={i}
					initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
					animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
					exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
					transition={{ duration: 0.3 }}
					className="font-semibold text-ink"
				>
					“{t(EXAMPLES[i] ?? "")}”
				</motion.span>
			</AnimatePresence>
		</p>
	);
}

/** A tiny line of this month's daily spending, so the card shows the shape, not just a total. */
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
			className="mt-3 h-8 w-full"
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
				transition={{ duration: 1.2, delay: 0.4 }}
			/>
		</svg>
	);
}

function StatCard({
	label,
	children,
	question,
	onAsk,
	className,
	delay,
}: {
	label: ReactNode;
	children: ReactNode;
	question: string;
	onAsk: (q: string) => void;
	className: string;
	delay: number;
}) {
	return (
		<motion.li
			initial={{ opacity: 0, y: 24, rotate: -1.5 }}
			animate={{ opacity: 1, y: 0, rotate: 0 }}
			transition={{ delay, type: "spring", stiffness: 150, damping: 16 }}
		>
			<button
				type="button"
				onClick={() => onAsk(question)}
				className={cn(
					"group relative flex h-full w-full flex-col overflow-hidden rounded-panel p-4 text-left shadow-lift transition-transform hover:-translate-y-1",
					className,
				)}
			>
				<span
					className="bg-scales pointer-events-none absolute inset-0 opacity-20"
					aria-hidden="true"
				/>
				<span className="relative text-[0.9rem] font-semibold opacity-90">
					{label}
				</span>
				<span className="relative">{children}</span>
				<span className="relative mt-auto inline-flex items-center gap-1 pt-3 text-[0.88rem] font-semibold opacity-90 group-hover:opacity-100">
					{question}
					<ArrowUpRight
						className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
						aria-hidden="true"
					/>
				</span>
			</button>
		</motion.li>
	);
}

/** First screen: the person's month as three tappable cards, plus quick ideas. */
export function AskWelcome({
	onAsk,
	onTone,
	name,
	composer,
}: {
	/** The question box, shown right under the greeting. */
	composer?: ReactNode;
	onAsk: (q: string) => void;
	/** A roast of the month's spending, or a hype-up of its wins. */
	onTone: (tone: "roast" | "hype") => void;
	name: string;
}) {
	const { data: summary } = useQuery(summaryQuery);
	const { data: categories = [] } = useQuery(categoriesQuery);
	const { data: goals = [] } = useQuery(goalsQuery);
	const { data: recurring } = useQuery(recurringQuery);
	const { data: heat } = useQuery(heatmapQuery(thisMonth()));

	const cur = summary?.homeCurrency ?? "MYR";
	const top = [...(summary?.byCategory ?? [])].sort(
		(a, b) => b.spentMinor - a.spentMinor,
	)[0];
	const topCat = categories.find((c) => c.id === top?.categoryId);
	const topShare =
		top && summary?.monthSpentMinor
			? Math.round((top.spentMinor / summary.monthSpentMinor) * 100)
			: 0;
	const goal = goals.find((g) => g.savedMinor < g.targetMinor);
	const dayValues = heat
		? Array.from({ length: Number(heat.today.slice(8, 10)) }, (_, i) => {
				const day = `${heat.month}-${String(i + 1).padStart(2, "0")}`;
				return heat.days.find((d) => d.day === day)?.minor ?? 0;
			})
		: [];
	const monthLabel = formatDay(appToday(), { month: "long" });

	const ideas = [
		{
			text: recurring?.billsDue.items.length
				? t("Which bills are still due this month?")
				: t("What subscriptions am I paying for?"),
			icon: <CalendarClock className="size-4" />,
		},
		{
			text: goal
				? t("Am I on track for {goal}?", { goal: goal.name })
				: t("How much could I save this month?"),
			icon: <Target className="size-4" />,
		},
		{
			text: t("Lunch 12 and grab 9 yesterday"),
			icon: <PenLine className="size-4" />,
		},
	];

	return (
		<div className="pt-2 sm:pt-6">
			<div className="flex items-start gap-4">
				<motion.div
					initial={{ scale: 0, rotate: -90 }}
					animate={{ scale: 1, rotate: 0 }}
					transition={{ type: "spring", stiffness: 180, damping: 12 }}
				>
					<SpendidCoin size="lg" />
				</motion.div>
				<div className="min-w-0">
					<motion.h1
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.1 }}
						className="text-[clamp(2rem,8vw,3.2rem)] leading-[1.04] font-extrabold"
					>
						{t("Hi {name}, ask me anything about your money.", { name })}
					</motion.h1>
					<RotatingExample />
				</div>
			</div>
			{composer && <div className="mt-5">{composer}</div>}

			{summary && (
				<ul className="mt-7 grid gap-3 sm:grid-cols-3">
					<StatCard
						delay={0.15}
						onAsk={onAsk}
						label={
							<span className="inline-flex items-center gap-1.5">
								<Wallet className="size-4" aria-hidden="true" />{" "}
								{t("Safe to spend today")}
							</span>
						}
						question={t("How is today's amount worked out?")}
						className="bg-linear-to-br from-plum-800 to-plum-500 text-white"
					>
						<CountUp
							minor={Math.max(0, summary.safe.safeTodayMinor)}
							currency={cur}
							className="num mt-1 block text-[2rem] leading-tight font-extrabold text-marigold"
						/>
					</StatCard>
					<StatCard
						delay={0.23}
						onAsk={onAsk}
						label={t("Spent in {month}", { month: monthLabel })}
						question={t("Where did my {amount} go?", {
							amount: formatMinor(summary.monthSpentMinor, cur),
						})}
						className="bg-linear-to-br from-coral to-marigold-deep text-white"
					>
						<CountUp
							minor={summary.monthSpentMinor}
							currency={cur}
							className="num mt-1 block text-[2rem] leading-tight font-extrabold"
						/>
						<Sparkline values={dayValues} />
					</StatCard>
					{topCat && top && (
						<StatCard
							delay={0.31}
							onAsk={onAsk}
							label={
								<span className="inline-flex items-center gap-2">
									<CategoryIcon
										icon={topCat.icon}
										tint={topCat.tint}
										size="sm"
										className="ring-2 ring-white/60"
									/>{" "}
									{t("Biggest category")}
								</span>
							}
							question={t("Why so much on {category}?", {
								category: t(topCat.name).toLowerCase(),
							})}
							className={cn(
								"bg-linear-to-br text-plum-950",
								TINTS[topCat.tint] ?? TINTS.slate,
							)}
						>
							<span className="mt-1 block text-[1.6rem] leading-tight font-extrabold break-words">
								{t(topCat.name)}
							</span>
							<span className="num block font-semibold">
								{t("{amount}, {pct}% of the month", {
									amount: formatMinor(top.spentMinor, cur),
									pct: topShare,
								})}
							</span>
						</StatCard>
					)}
				</ul>
			)}

			<div className="mt-5 grid gap-3 sm:grid-cols-2">
				<motion.button
					type="button"
					whileHover={{ y: -2 }}
					whileTap={{ scale: 0.97 }}
					onClick={() => onTone("roast")}
					className="flex items-center gap-3 rounded-panel bg-linear-to-br from-coral to-[#ff8a3d] p-4 text-left text-white shadow-lift"
				>
					<Flame className="size-7 shrink-0" aria-hidden="true" />
					<span>
						<span className="block text-[1.1rem] font-extrabold">
							{t("Roast my month")}
						</span>
						<span className="block text-[0.88rem] text-white/90">
							{t("Honest, funny, and with one tip")}
						</span>
					</span>
				</motion.button>
				<motion.button
					type="button"
					whileHover={{ y: -2 }}
					whileTap={{ scale: 0.97 }}
					onClick={() => onTone("hype")}
					className="flex items-center gap-3 rounded-panel bg-linear-to-br from-plum-700 to-plum-500 p-4 text-left text-white shadow-lift"
				>
					<PartyPopper
						className="size-7 shrink-0 text-marigold"
						aria-hidden="true"
					/>
					<span>
						<span className="block text-[1.1rem] font-extrabold">
							{t("Hype me up")}
						</span>
						<span className="block text-[0.88rem] text-white/90">
							{t("Your real wins this month, cheered")}
						</span>
					</span>
				</motion.button>
			</div>

			<div className="mt-4 flex flex-wrap gap-2">
				{ideas.map((idea, i) => (
					<motion.button
						key={idea.text}
						type="button"
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.45 + i * 0.06 }}
						onClick={() => onAsk(idea.text)}
						className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-left text-[0.92rem] font-semibold shadow-sm hover:border-plum-300 hover:shadow-lift"
					>
						<span className="text-plum-500" aria-hidden="true">
							{idea.icon}
						</span>
						{idea.text}
					</motion.button>
				))}
			</div>

			<p className="mt-6 inline-flex items-center gap-2 text-[0.9rem] text-ink-soft">
				<Lock className="size-4 shrink-0" aria-hidden="true" />{" "}
				{t(
					"Answers use only your own data. Chats are saved to your account, and only you can see them.",
				)}
			</p>
		</div>
	);
}
