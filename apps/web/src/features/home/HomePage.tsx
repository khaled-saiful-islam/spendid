import { formatMinor } from "@spendid/shared";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { t } from "@/i18n";
import { meQuery } from "@/lib/me";
import { goalsQuery, summaryQuery } from "@/lib/money-api";
import { appHour, formatMoment } from "@/lib/time";
import { capture } from "../capture/capture-store";
import { TransactionRow, useCategoryMap } from "../money/TransactionRow";
import { GoalJar } from "../plan/GoalJar";
import { PendingReceipts } from "../scan/PendingReceipts";
import { DueSoonCard } from "../subscriptions/DueSoonCard";
import { AskCard } from "./AskCard";
import { MonthCard } from "./MonthCard";
import { MonthPace } from "./MonthPace";
import { SafeCard } from "./SafeCard";

function greeting(date: Date): string {
	const h = appHour(date);
	if (h < 5) return t("Up late");
	if (h < 12) return t("Good morning");
	if (h < 18) return t("Good afternoon");
	return t("Good evening");
}

export function HomePage() {
	const { data: me } = useSuspenseQuery(meQuery);
	const { data: summary } = useQuery(summaryQuery);
	const { data: goals = [] } = useQuery(goalsQuery);
	const categories = useCategoryMap();
	const now = new Date();
	const firstName = me?.user.name.split(" ")[0] ?? "";
	const todayTotal =
		summary?.today.reduce((s, t) => s + t.homeAmountMinor, 0) ?? 0;

	return (
		<div className="space-y-5">
			<PageHeader
				title={`${greeting(now)}, ${firstName}`}
				sub={formatMoment(now, {
					weekday: "long",
					day: "numeric",
					month: "long",
				})}
			/>

			<PendingReceipts />

			{summary ? (
				<SafeCard summary={summary} />
			) : (
				<div className="h-40 animate-pulse rounded-panel bg-surface-2" />
			)}

			<AskCard />
			<DueSoonCard />
			{summary && <MonthPace summary={summary} />}

			<section
				aria-labelledby="today-title"
				className="rounded-panel border border-line bg-surface p-3 sm:p-4"
			>
				<div className="flex items-center justify-between gap-3 px-2 pt-2">
					<h2 id="today-title" className="text-[1.1rem] font-bold">
						{t("Today")}
					</h2>
					{summary && todayTotal > 0 && (
						<span className="num font-semibold text-ink-soft">
							{formatMinor(todayTotal, summary.homeCurrency)}
						</span>
					)}
				</div>
				{summary && summary.today.length === 0 ? (
					<div className="px-2 py-8 text-center">
						<p className="font-display text-[1.2rem] font-bold">
							{t("Nothing logged yet today")}
						</p>
						<p className="mx-auto mt-1 max-w-[34ch] text-ink-soft">
							{t("Say it, snap it or type it. It takes a few seconds.")}
						</p>
						<button
							type="button"
							onClick={capture.openType}
							className={buttonClass("coin", "md", "mt-4")}
						>
							<Plus className="size-5" aria-hidden="true" />{" "}
							{t("Add an expense")}
						</button>
					</div>
				) : (
					<ul className="mt-2">
						<AnimatePresence initial={false}>
							{summary?.today.map((t) => (
								<TransactionRow
									key={t.id}
									t={t}
									category={categories.get(t.categoryId)}
								/>
							))}
						</AnimatePresence>
					</ul>
				)}
			</section>

			{summary && summary.monthSpentMinor > 0 && (
				<MonthCard summary={summary} />
			)}

			{goals.length > 0 && summary && (
				<section aria-labelledby="goals-title">
					<div className="flex items-center justify-between">
						<h2 id="goals-title" className="text-[1.1rem] font-bold">
							{t("Saving for")}
						</h2>
						<Link
							to="/app/plan"
							className="font-medium text-ink-soft hover:text-ink"
						>
							{t("All goals")}
						</Link>
					</div>
					<ul className="mt-2.5 grid grid-cols-2 gap-3">
						{goals.slice(0, 2).map((g) => (
							<li
								key={g.id}
								className="rounded-panel border border-line bg-surface p-3"
							>
								<GoalJar
									ratio={g.savedMinor / g.targetMinor}
									emoji={g.emoji}
									className="mx-auto h-16"
								/>
								<p className="mt-2 text-center font-semibold break-words">
									{g.name}
								</p>
								<p className="num text-center text-[0.9rem] text-ink-soft">
									{t("{pct}% of {amount}", {
										pct: Math.round((g.savedMinor / g.targetMinor) * 100),
										amount: formatMinor(g.targetMinor, summary.homeCurrency),
									})}
								</p>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
