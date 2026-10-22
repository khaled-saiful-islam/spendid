import { formatMinor } from "@spendid/shared";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Plus, Receipt, Target } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { meQuery } from "@/lib/me";
import { goalsQuery, summaryQuery } from "@/lib/money-api";
import { appHour, formatMoment } from "@/lib/time";
import { capture } from "../capture/capture-store";
import { TransactionRow, useCategoryMap } from "../money/TransactionRow";
import { GoalJar } from "../plan/GoalJar";
import { goalTint } from "../plan/goal-tint";
import { PendingReceipts } from "../scan/PendingReceipts";
import { DueSoonCard } from "../subscriptions/DueSoonCard";
import { AskCard } from "./AskCard";
import { InstallNudge } from "./InstallNudge";
import { MonthPace } from "./MonthPace";
import { SafeCard } from "./SafeCard";
import { StatTiles } from "./StatTiles";

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

			<InstallNudge />
			<PendingReceipts />

			{summary ? (
				<SafeCard summary={summary} />
			) : (
				<div className="h-40 animate-pulse rounded-panel bg-surface-2" />
			)}

			{summary && <StatTiles summary={summary} goals={goals} />}
			<AskCard />
			<DueSoonCard />

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
				<section aria-labelledby="today-title" className="space-y-3">
					<SectionHeader
						id="today-title"
						title={t("Today")}
						icon={Receipt}
						tint="orange"
						sub={
							summary && todayTotal > 0
								? formatMinor(todayTotal, summary.homeCurrency)
								: undefined
						}
					/>
					<div className="rounded-panel border border-line bg-surface p-2 sm:p-3">
						{summary && summary.today.length === 0 ? (
							<div className="px-2 py-6 text-center">
								<p className="font-display text-[1.1rem] font-bold">
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
							<ul>
								<AnimatePresence initial={false}>
									{summary?.today.map((tx) => (
										<TransactionRow
											key={tx.id}
											t={tx}
											category={categories.get(tx.categoryId)}
										/>
									))}
								</AnimatePresence>
							</ul>
						)}
					</div>
				</section>
				{summary && <MonthPace summary={summary} />}
			</div>

			{goals.length > 0 && summary && (
				<section aria-labelledby="goals-title" className="space-y-3">
					<SectionHeader
						id="goals-title"
						title={t("Saving for")}
						icon={Target}
						tint="lime"
						action={
							<Link
								to="/app/plan"
								className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-[0.9rem] font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink"
							>
								{t("All goals")}
								<ChevronRight className="size-4" aria-hidden="true" />
							</Link>
						}
					/>
					<ul className="grid grid-cols-2 gap-3">
						{goals.slice(0, 2).map((g) => {
							const ratio = Math.min(1, g.savedMinor / g.targetMinor);
							const tint = goalTint(g.id);
							return (
								<li key={g.id}>
									<Link
										to="/app/plan"
										className="relative flex h-full items-center gap-3 overflow-hidden rounded-panel border border-line bg-surface p-3 transition-transform hover:-translate-y-0.5 sm:p-4"
									>
										<span
											aria-hidden="true"
											className={cn(
												"pointer-events-none absolute inset-0 bg-linear-to-br opacity-[0.16] dark:opacity-[0.12]",
												tint,
											)}
										/>
										<GoalJar
											ratio={ratio}
											emoji={g.emoji}
											className="relative h-16 shrink-0"
										/>
										<span className="relative min-w-0 flex-1">
											<span className="block leading-tight font-semibold break-words">
												{g.name}
											</span>
											<span
												data-money
												className="num block text-[1.25rem] font-extrabold"
											>
												{Math.round(ratio * 100)}%
											</span>
											<span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink/10">
												<span
													className={cn(
														"block h-full rounded-full bg-linear-to-r",
														tint,
													)}
													style={{ width: `${ratio * 100}%` }}
												/>
											</span>
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</section>
			)}
		</div>
	);
}
