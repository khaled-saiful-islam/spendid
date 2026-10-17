import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/PageHeader";
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
import { Challenges } from "./Challenges";
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
		<div className="space-y-5">
			<PageHeader title={t("Your plan")} />

			<section
				aria-labelledby="style-heading"
				className="rounded-panel border border-line bg-surface p-4 sm:p-5"
			>
				<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<h2 id="style-heading" className="text-[1.1rem] font-bold">
						{method?.title ?? t("Budget")}
					</h2>
					<Link
						to="/onboarding"
						search={{ edit: true }}
						className="text-[0.9rem] font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
					>
						{t("Change style")}
					</Link>
				</div>
				<div className="mt-3">
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
			<Challenges />
			<ImpulsePause />
			<WarrantyVault />
		</div>
	);
}
