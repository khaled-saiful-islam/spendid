import { useQuery } from "@tanstack/react-query";
import {
	ArrowUpRight,
	CalendarClock,
	Flame,
	Lock,
	PartyPopper,
	Shuffle,
	Target,
	TrendingUp,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import { CategoryIcon, TINTS } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { recurringQuery } from "@/lib/insights-api";
import { categoriesQuery, goalsQuery, summaryQuery } from "@/lib/money-api";
import { LogDemo } from "./LogDemo";

/** How many of this month's categories the category tile can cycle through. */
const MAX_CATEGORIES = 6;

/**
 * Text that changes in place without resizing anything: the slot is as tall as the longest
 * of its options, so nothing around it moves.
 */
function SwapText({
	text,
	options = [],
	className,
}: {
	text: string;
	options?: string[];
	className?: string;
}) {
	return (
		<span className={cn("grid min-w-0", className)}>
			{options.map((o) => (
				<span
					key={o}
					aria-hidden="true"
					className="invisible break-words [grid-area:1/1]"
				>
					{o}
				</span>
			))}
			<AnimatePresence initial={false}>
				<motion.span
					key={text}
					className="self-center break-words [grid-area:1/1]"
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -6 }}
					transition={{ duration: 0.22 }}
				>
					{text}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

/**
 * A question to ask, nothing more: no numbers on the tile, the answer comes from the chat.
 * The colour wash and icon say which part of your money it's about; tapping fills the box.
 */
function IdeaTile({
	tint,
	icon,
	question,
	options,
	extra,
	onAsk,
	index,
}: {
	tint: string;
	icon: ReactNode;
	question: string;
	/** Every question this tile can show, so swapping one never resizes the tile. */
	options?: string[];
	/** A control at the tile's end, in place of the arrow (it can't sit inside the button). */
	extra?: ReactNode;
	onAsk: (q: string) => void;
	index: number;
}) {
	const reduce = useReducedMotion();
	return (
		<motion.li
			className="relative"
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
				aria-label={question}
				onClick={() => onAsk(question)}
				className={cn(
					"group relative flex h-full w-full items-center gap-3 overflow-hidden rounded-panel border border-line bg-surface p-3 text-left",
					extra && "pr-15",
				)}
			>
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute inset-0 bg-linear-to-r opacity-[0.16] transition-opacity group-hover:opacity-[0.28] dark:opacity-[0.13] dark:group-hover:opacity-[0.22]",
						tint,
					)}
				/>
				<span className="relative shrink-0">{icon}</span>
				<SwapText
					text={question}
					options={options}
					className="relative flex-1 text-[1rem] leading-snug font-bold"
				/>
				{!extra && (
					<span
						aria-hidden="true"
						className="relative grid size-9 shrink-0 place-items-center rounded-full bg-surface/80 ring-1 ring-line transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
					>
						<ArrowUpRight className="size-4" />
					</span>
				)}
			</button>
			{extra}
		</motion.li>
	);
}

/** A round badge for a tile's icon, filled with the tile's colour. */
function Badge({ tint, children }: { tint: string; children: ReactNode }) {
	return (
		<span
			className={cn(
				"grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br text-white shadow-sm",
				tint,
			)}
		>
			{children}
		</span>
	);
}

/** First screen, under the question box: an example, questions about this month, two modes. */
export function AskWelcome({
	onAsk,
	onTone,
}: {
	onAsk: (q: string) => void;
	/** A roast of the month's spending, or a hype-up of its wins. */
	onTone: (tone: "roast" | "hype") => void;
}) {
	const { data: summary } = useQuery(summaryQuery);
	const { data: categories = [] } = useQuery(categoriesQuery);
	const { data: goals = [] } = useQuery(goalsQuery);
	const { data: recurring } = useQuery(recurringQuery);
	const [catIndex, setCatIndex] = useState(0);

	// Only categories with spending this month, biggest first, so every question has an answer.
	const spentIn = [...(summary?.byCategory ?? [])]
		.filter((c) => c.spentMinor > 0)
		.sort((a, b) => b.spentMinor - a.spentMinor)
		.flatMap((c) => categories.filter((cat) => cat.id === c.categoryId))
		.slice(0, MAX_CATEGORIES);
	const cat = spentIn[catIndex % Math.max(spentIn.length, 1)];
	const catQuestion = (name: string) =>
		t("Why so much on {category}?", { category: t(name).toLowerCase() });
	const goal = goals.find((g) => g.savedMinor < g.targetMinor);
	const billsDue = (recurring?.billsDue.items.length ?? 0) > 0;

	const tiles: ReactNode[] = [];
	if (summary)
		tiles.push(
			<IdeaTile
				key="spent"
				index={tiles.length}
				onAsk={onAsk}
				tint={TINTS.amber ?? ""}
				icon={
					<Badge tint={TINTS.amber ?? ""}>
						<TrendingUp className="size-[1.15rem]" aria-hidden="true" />
					</Badge>
				}
				question={t("How much have I spent this month?")}
			/>,
		);
	if (cat)
		tiles.push(
			<IdeaTile
				key="category"
				index={tiles.length}
				onAsk={onAsk}
				tint={TINTS[cat.tint] ?? TINTS.slate ?? ""}
				icon={
					<CategoryIcon
						icon={cat.icon}
						tint={cat.tint}
						size="sm"
						className="size-10 [&_svg]:size-[1.15rem]"
					/>
				}
				question={catQuestion(cat.name)}
				options={spentIn.map((c) => catQuestion(c.name))}
				extra={
					spentIn.length > 1 && (
						<span className="absolute inset-y-0 right-3 z-10 flex items-center">
							<motion.button
								type="button"
								whileTap={{ scale: 0.9, rotate: -20 }}
								onClick={() => setCatIndex((i) => (i + 1) % spentIn.length)}
								aria-label={t("Ask about another category")}
								title={t("Ask about another category")}
								className="grid size-9 place-items-center rounded-full bg-surface text-ink shadow-sm ring-1 ring-line hover:bg-surface-2"
							>
								<Shuffle className="size-4" aria-hidden="true" />
							</motion.button>
						</span>
					)
				}
			/>,
		);
	if (billsDue)
		tiles.push(
			<IdeaTile
				key="bills"
				index={tiles.length}
				onAsk={onAsk}
				tint={TINTS.sky ?? ""}
				icon={
					<Badge tint={TINTS.sky ?? ""}>
						<CalendarClock className="size-[1.15rem]" aria-hidden="true" />
					</Badge>
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
						<Target className="size-[1.15rem]" aria-hidden="true" />
					</Badge>
				}
				question={t("Am I on track for {goal}?", { goal: goal.name })}
			/>,
		);

	return (
		<div className="space-y-4">
			<section aria-labelledby="ask-ideas">
				<h2 id="ask-ideas" className="sr-only">
					{t("Questions about your month")}
				</h2>
				<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<li className="col-span-full">
						<LogDemo currency={summary?.homeCurrency ?? "MYR"} />
					</li>
					{tiles}
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
