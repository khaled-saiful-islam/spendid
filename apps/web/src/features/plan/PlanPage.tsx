import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
import { PlanHero } from "./PlanHero";
import { CategoryBudgets } from "./StyleBudgets";
import { TransfersSection } from "./Transfers";
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

			{summary.incomeMinor !== null && summary.method === null ? (
				<section className="rounded-panel border-2 border-dashed border-line p-5">
					<p className="font-semibold">{t("You haven't picked a plan yet.")}</p>
					<p className="mt-1 text-[0.95rem] text-ink-soft">
						{t(
							"Safe to spend already works from your income. A plan shows where your money goes each month.",
						)}
					</p>
					<Link
						to="/onboarding"
						search={{ edit: true }}
						className={buttonClass("coin", "md", "mt-3")}
					>
						{t("Pick a plan")}
					</Link>
				</section>
			) : summary.incomeMinor === null ? (
				<section className="rounded-panel border-2 border-dashed border-line p-5">
					<p className="font-semibold">
						{t("Add your monthly income to plan your budget.")}
					</p>
					<Link
						to="/onboarding"
						search={{ edit: true }}
						className={buttonClass("coin", "md", "mt-3")}
					>
						{t("Add income")}
					</Link>
				</section>
			) : (
				<PlanHero
					summary={summary}
					categoryMap={categoryMap}
					categories={categories}
					budgets={budgets}
					methodTitle={method?.title ?? t("Budget")}
				/>
			)}

			{summary.incomeMinor !== null &&
				summary.method === "pay_yourself_first" && (
					<TransfersSection
						currency={summary.homeCurrency}
						incomeMinor={summary.incomeMinor}
					/>
				)}

			{summary.incomeMinor !== null &&
				(summary.method === "envelope" || summary.method === "zero_based") && (
					<section aria-labelledby="limits-heading" className="space-y-3">
						<SectionHeader
							id="limits-heading"
							title={t("Limits by category")}
							icon={SlidersHorizontal}
							tint="cyan"
							sub={t("Tap an amount to change it")}
						/>
						<div className="rounded-panel border border-line bg-surface p-3 sm:p-4">
							<CategoryBudgets
								summary={summary}
								categories={categories}
								budgets={budgets}
								zeroBased={summary.method === "zero_based"}
							/>
						</div>
					</section>
				)}

			<GoalsSection goals={goals} cur={summary.homeCurrency} />
			<Challenges />
			<div className="grid gap-5 lg:grid-cols-2 lg:items-start">
				<SubscriptionsDoorway />
				<WarrantyVault />
			</div>
			<ImpulsePause />
		</div>
	);
}
