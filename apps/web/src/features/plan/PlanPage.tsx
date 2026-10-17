import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { t } from "@/i18n";
import {
	budgetsQuery,
	categoriesQuery,
	goalsQuery,
	summaryQuery,
} from "@/lib/money-api";
import { useCategoryMap } from "../money/TransactionRow";
import { METHODS } from "../onboarding/options";
import { SubscriptionsDoorway } from "../subscriptions/DueSoonCard";
import { GoalsSection } from "./GoalsSection";
import { ImpulsePause } from "./ImpulsePause";
import { CategoryBudgets, FiftyThirtyTwenty } from "./StyleBudgets";
import { WarrantyVault } from "./WarrantyVault";

export function PlanPage() {
	const { data: summary } = useQuery(summaryQuery);
	const { data: categories = [] } = useQuery(categoriesQuery);
	const { data: budgets = [] } = useQuery(budgetsQuery);
	const { data: goals = [] } = useQuery(goalsQuery);
	const categoryMap = useCategoryMap();

	if (!summary)
		return <div className="h-64 animate-pulse rounded-panel bg-surface-2" />;
	const method = METHODS.find((m) => m.id === summary.method);

	return (
		<div className="space-y-8">
			<h1 className="text-[clamp(2rem,7vw,2.8rem)] font-bold">
				{t("Your plan")}
			</h1>

			<section
				aria-labelledby="style-heading"
				className="rounded-panel border border-line bg-surface p-5 sm:p-6"
			>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 id="style-heading" className="text-[1.6rem] font-bold">
							{method?.title ?? t("Budget")}
						</h2>
						<p className="mt-1 max-w-[50ch] text-ink-soft">{method?.body}</p>
					</div>
					<Link
						to="/onboarding"
						search={{ edit: true }}
						className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
					>
						{t("Change style")}
					</Link>
				</div>
				<div className="mt-6">
					{summary.incomeMinor === null ? (
						<p className="text-ink-soft">
							{t("Add your monthly income to plan your budget.")}
						</p>
					) : summary.method === "fifty_thirty_twenty" ? (
						<FiftyThirtyTwenty summary={summary} categories={categoryMap} />
					) : (
						<CategoryBudgets
							summary={summary}
							categories={categories}
							budgets={budgets}
							zeroBased={summary.method === "zero_based"}
						/>
					)}
				</div>
			</section>

			<SubscriptionsDoorway />
			<GoalsSection goals={goals} cur={summary.homeCurrency} />
			<ImpulsePause />
			<WarrantyVault />
		</div>
	);
}
