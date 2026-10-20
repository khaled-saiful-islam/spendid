import {
	type BudgetLine,
	type Category,
	formatMinor,
	type Summary,
} from "@spendid/shared";
import { Link } from "@tanstack/react-router";
import { Lightbulb, Lock } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { TINTS } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { appToday } from "@/lib/time";
import { transferFill } from "./transfer-drafts";

interface Block {
	key: string;
	label: string;
	planned: number;
	used: number;
	/** Background class for the fill (and, faded, the track). */
	fill: string;
	/** Kept aside up front rather than spent through the month. */
	locked?: boolean;
	/** What a locked block says under its amount. */
	note?: string;
}

/** Day of the month and how much of the month has gone, in the app's time zone. */
function monthProgress(summary: Summary) {
	const day = Number(appToday().slice(8, 10));
	const days = day - 1 + Math.max(1, summary.daysLeft);
	return { day, days, elapsed: day / days };
}

function fiftyThirtyTwenty(
	summary: Summary,
	categories: Map<string, Category>,
): Block[] {
	const income = summary.incomeMinor ?? 0;
	const spentBy = (kind: Category["kind"]) =>
		summary.byCategory
			.filter((c) => categories.get(c.categoryId)?.kind === kind)
			.reduce((s, c) => s + c.spentMinor, 0);
	return [
		{
			key: "need",
			label: t("Needs"),
			planned: income * 0.5,
			used: spentBy("need"),
			fill: "bg-jade",
		},
		{
			key: "want",
			label: t("Wants"),
			planned: income * 0.3,
			used: spentBy("want"),
			fill: "bg-sky",
		},
		{
			key: "save",
			label: t("Savings"),
			planned: income * 0.2,
			used: summary.reservedMinor,
			fill: "bg-marigold",
			locked: true,
		},
	];
}

function byLimits(
	summary: Summary,
	categories: Category[],
	budgets: BudgetLine[],
): Block[] {
	const spent = new Map(
		summary.byCategory.map((c) => [c.categoryId, c.spentMinor]),
	);
	const blocks: Block[] = budgets
		.map((b) => {
			const c = categories.find((x) => x.id === b.categoryId);
			return {
				key: b.categoryId,
				label: t(c?.name ?? "Category"),
				planned: b.monthlyLimitMinor,
				used: spent.get(b.categoryId) ?? 0,
				fill: cn("bg-linear-to-r", TINTS[c?.tint ?? "slate"] ?? TINTS.slate),
			};
		})
		.sort((a, b) => b.planned - a.planned);
	if (summary.reservedMinor > 0)
		blocks.push({
			key: "save",
			label: t("Savings"),
			planned: summary.reservedMinor,
			used: summary.reservedMinor,
			fill: "bg-marigold",
			locked: true,
		});
	return blocks;
}

/** Pay yourself first: each transfer goes out first; everything after is "To spend". */
function payYourselfFirst(summary: Summary): Block[] {
	const income = summary.incomeMinor ?? 0;
	return [
		...summary.transfers.map((x, i) => ({
			key: `transfer-${i}`,
			label: x.name,
			planned: x.amountMinor,
			used: x.amountMinor,
			fill: transferFill(i),
			locked: true,
			note: t("sent out first"),
		})),
		{
			key: "spend",
			label: t("To spend"),
			planned: Math.max(0, income - summary.reservedMinor),
			used: summary.monthSpentMinor,
			fill: "bg-jade",
		},
	];
}

/** One plain sentence on how the month is going against the plan. */
function insight(blocks: Block[], summary: Summary): string {
	const { day, days, elapsed } = monthProgress(summary);
	const money = (m: number) => formatMinor(m, summary.homeCurrency);
	const spending = blocks.filter((b) => !b.locked && b.planned > 0);
	const over = spending
		.filter((b) => b.used > b.planned)
		.sort((a, b) => b.used - b.planned - (a.used - a.planned))[0];
	if (over)
		return t("{name} is {amount} over plan. Easing off there helps most.", {
			name: over.label,
			amount: money(over.used - over.planned),
		});
	const ahead = spending
		.filter((b) => b.used / b.planned > elapsed + 0.1)
		.sort((a, b) => b.used / b.planned - a.used / a.planned)[0];
	if (ahead)
		return t(
			"{name} is ahead of the month: {used}% used with {gone}% of the month gone.",
			{
				name: ahead.label,
				used: Math.round((ahead.used / ahead.planned) * 100),
				gone: Math.round(elapsed * 100),
			},
		);
	return t("Day {day} of {days}: everything is on pace. Nicely done.", {
		day,
		days,
	});
}

/**
 * The plan at a glance: income as one bar split the way the budget style splits it. Each
 * block fills as the month is spent; the thin line in a block is where an even pace would
 * be today, so a fill past it is running ahead.
 */
export function PlanHero({
	summary,
	categoryMap,
	categories,
	budgets,
	methodTitle,
}: {
	summary: Summary;
	categoryMap: Map<string, Category>;
	categories: Category[];
	budgets: BudgetLine[];
	methodTitle: string;
}) {
	const reduce = useReducedMotion();
	const cur = summary.homeCurrency;
	const money = (m: number) => formatMinor(m, cur);
	const income = summary.incomeMinor ?? 0;
	const blocks =
		summary.method === "fifty_thirty_twenty"
			? fiftyThirtyTwenty(summary, categoryMap)
			: summary.method === "pay_yourself_first"
				? payYourselfFirst(summary)
				: byLimits(summary, categories, budgets);
	const plannedTotal = blocks.reduce((s, b) => s + b.planned, 0);
	const free = Math.max(0, income - plannedTotal);
	const { elapsed } = monthProgress(summary);

	return (
		<section
			aria-labelledby="plan-hero-title"
			className="bg-scales relative overflow-hidden rounded-panel bg-plum-900 p-5 text-plum-50 sm:p-6 dark:bg-plum-800"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2
						id="plan-hero-title"
						className="font-sans text-[0.9rem] font-medium text-plum-200"
					>
						{t("Monthly income")}
					</h2>
					<p
						data-money
						className="num text-[clamp(1.9rem,8vw,2.5rem)] leading-tight font-extrabold text-marigold"
					>
						{money(income)}
					</p>
				</div>
				<Link
					to="/onboarding"
					search={{ edit: true }}
					className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white/10 px-3.5 text-[0.9rem] font-semibold ring-1 ring-white/15 hover:bg-white/15"
				>
					{methodTitle}
					<span className="text-plum-200">{t("Change")}</span>
				</Link>
			</div>

			{blocks.length === 0 ? (
				<p className="mt-4 text-plum-200">
					{t("Set a limit on a category below to see your plan here.")}
				</p>
			) : (
				<>
					<div
						className="mt-5 flex h-11 gap-[3px]"
						role="img"
						aria-label={blocks
							.map(
								(b) =>
									`${b.label}: ${money(b.used)} ${t("of {amount}", { amount: money(b.planned) })}`,
							)
							.join(", ")}
					>
						{blocks.map((b, i) => {
							const ratio = b.planned > 0 ? b.used / b.planned : 0;
							return (
								<div
									key={b.key}
									className="relative overflow-hidden first:rounded-l-tile last:rounded-r-tile"
									style={{ flexGrow: b.planned, flexBasis: 0 }}
								>
									<span className={cn("absolute inset-0 opacity-25", b.fill)} />
									<motion.span
										className={cn(
											"absolute inset-y-0 left-0",
											ratio > 1 ? "bg-coral" : b.fill,
										)}
										initial={reduce ? false : { width: 0 }}
										animate={{ width: `${Math.min(1, ratio) * 100}%` }}
										transition={{
											delay: reduce ? 0 : 0.1 + i * 0.12,
											duration: 0.8,
											ease: [0.22, 1, 0.36, 1],
										}}
									/>
									{b.locked ? (
										<Lock
											className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-plum-950"
											aria-hidden="true"
										/>
									) : (
										<span
											className="absolute inset-y-1.5 w-0.5 rounded-full bg-white/80 mix-blend-normal"
											style={{ left: `${Math.min(98, elapsed * 100)}%` }}
										/>
									)}
								</div>
							);
						})}
						{free > 0 && (
							<div
								className="rounded-r-tile border-2 border-dashed border-white/20"
								style={{ flexGrow: free, flexBasis: 0 }}
							/>
						)}
					</div>

					<ul
						className={cn(
							"mt-4 grid gap-x-4 gap-y-3",
							blocks.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
						)}
					>
						{blocks.slice(0, 8).map((b) => {
							const left = b.planned - b.used;
							return (
								<li key={b.key} className="min-w-0">
									<span className="flex items-center gap-1.5 text-[0.82rem] text-plum-200">
										<span
											className={cn("size-2.5 shrink-0 rounded-full", b.fill)}
											aria-hidden="true"
										/>
										<span className="min-w-0 break-words">{b.label}</span>
									</span>
									<span
										data-money
										className="num block text-[0.98rem] font-bold break-words"
									>
										{money(b.used)}
									</span>
									<span
										data-money
										className={cn(
											"num block text-[0.78rem] leading-snug",
											b.locked
												? "text-plum-200"
												: left < 0
													? "text-coral"
													: "text-plum-200",
										)}
									>
										{b.locked
											? (b.note ?? t("kept aside first"))
											: left < 0
												? t("{amount} over", { amount: money(-left) })
												: t("{amount} left", { amount: money(left) })}
									</span>
								</li>
							);
						})}
					</ul>

					<p className="mt-4 flex items-start gap-2 border-t border-white/10 pt-3 text-[0.9rem] leading-snug">
						<Lightbulb
							className="mt-0.5 size-4 shrink-0 text-marigold"
							aria-hidden="true"
						/>
						<span>{insight(blocks, summary)}</span>
					</p>
					<p className="mt-1.5 flex items-center gap-1.5 text-[0.75rem] text-plum-200">
						<span
							className="inline-block h-3 w-0.5 rounded-full bg-white/80"
							aria-hidden="true"
						/>
						{t("Where an even pace would be today")}
					</p>
				</>
			)}
		</section>
	);
}
