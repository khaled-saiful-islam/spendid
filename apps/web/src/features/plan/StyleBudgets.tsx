import {
	type BudgetLine,
	type Category,
	formatMinor,
	minorDigits,
	type Summary,
	toMinor,
} from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { PiggyBank } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { moneyApi, refreshMoney } from "@/lib/money-api";

function Bar({
	spent,
	target,
	tone,
}: {
	spent: number;
	target: number;
	tone: string;
}) {
	const ratio = target > 0 ? spent / target : 0;
	return (
		<div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
			<motion.div
				className={cn("h-full rounded-full", ratio > 1 ? "bg-coral" : tone)}
				initial={{ width: 0 }}
				animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
				transition={{ type: "spring", stiffness: 80, damping: 18 }}
			/>
		</div>
	);
}

/** Needs / wants / savings against 50 / 30 / 20 of income. */
export function FiftyThirtyTwenty({
	summary,
	categories,
}: {
	summary: Summary;
	categories: Map<string, Category>;
}) {
	const income = summary.incomeMinor ?? 0;
	const spentBy = (kind: Category["kind"]) =>
		summary.byCategory
			.filter((c) => categories.get(c.categoryId)?.kind === kind)
			.reduce((s, c) => s + c.spentMinor, 0);
	const money = (m: number) => formatMinor(m, summary.homeCurrency);
	const rows = [
		{
			label: t("Needs"),
			hint: t("Bills, groceries, transport, health"),
			spent: spentBy("need"),
			target: income * 0.5,
			tone: "bg-jade",
		},
		{
			label: t("Wants"),
			hint: t("Eating out, shopping, fun, travel"),
			spent: spentBy("want"),
			target: income * 0.3,
			tone: "bg-sky",
		},
	];

	return (
		<div className="space-y-3.5">
			{rows.map((r) => (
				<div key={r.label} title={r.hint}>
					<div className="flex flex-wrap items-baseline justify-between gap-x-3">
						<span className="font-semibold">{r.label}</span>
						<span className="num text-[0.92rem] text-ink-soft">
							<strong className="text-ink">{money(r.spent)}</strong>{" "}
							{t("of {amount}", { amount: money(r.target) })}
						</span>
					</div>
					<Bar spent={r.spent} target={r.target} tone={r.tone} />
				</div>
			))}
			<div className="flex items-center gap-2.5 border-t border-line pt-3 text-[0.92rem]">
				<PiggyBank
					className="size-[1.1rem] shrink-0 text-marigold-deep"
					aria-hidden="true"
				/>
				<p className="text-ink-soft">
					<span className="font-semibold text-ink">{t("Savings")}</span>{" "}
					<strong className="num text-ink">
						{money(summary.reservedMinor)}
					</strong>{" "}
					{t("kept aside first")}
				</p>
			</div>
		</div>
	);
}

interface CategoryBudgetsProps {
	summary: Summary;
	categories: Category[];
	budgets: BudgetLine[];
	zeroBased: boolean;
}

/** Envelope and zero-based styles: a limit per category, set inline. */
export function CategoryBudgets({
	summary,
	categories,
	budgets,
	zeroBased,
}: CategoryBudgetsProps) {
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState<string | null>(null);
	const [value, setValue] = useState("");
	const cur = summary.homeCurrency;
	const limitOf = new Map(
		budgets.map((b) => [b.categoryId, b.monthlyLimitMinor]),
	);
	const spentOf = new Map(
		summary.byCategory.map((c) => [c.categoryId, c.spentMinor]),
	);
	const assigned =
		budgets.reduce((s, b) => s + b.monthlyLimitMinor, 0) +
		summary.reservedMinor;
	const unassigned = (summary.incomeMinor ?? 0) - assigned;

	async function save(categoryId: string) {
		const n = Number(value.replace(",", "."));
		const monthlyLimitMinor =
			value.trim() === "" || n === 0 ? null : toMinor(n, cur);
		if (monthlyLimitMinor !== null && !(n > 0)) return;
		await moneyApi.setBudget({ categoryId, monthlyLimitMinor });
		await refreshMoney(queryClient);
		setEditing(null);
	}

	return (
		<div className="space-y-3">
			{zeroBased && summary.incomeMinor !== null && (
				<p
					className={cn(
						"rounded-tile px-3.5 py-2.5 text-[0.92rem] font-medium",
						unassigned === 0 ? "bg-jade/12 text-safe" : "bg-marigold/15",
					)}
				>
					{unassigned === 0
						? t("Every bit of income has a job. Nicely done.")
						: unassigned > 0
							? t("{amount} still needs a job.", {
									amount: formatMinor(unassigned, cur),
								})
							: t("You've planned {amount} more than you earn.", {
									amount: formatMinor(-unassigned, cur),
								})}
				</p>
			)}
			<ul className="divide-y divide-line">
				{categories.map((c) => {
					const limit = limitOf.get(c.id);
					const spent = spentOf.get(c.id) ?? 0;
					const open = editing === c.id;
					return (
						<li key={c.id} className="py-2.5">
							<div className="flex items-center gap-3">
								<CategoryIcon
									icon={c.icon}
									tint={c.tint}
									size="sm"
									className="size-8"
								/>
								<span className="min-w-0 flex-1 font-medium break-words">
									{c.name}
								</span>
								<button
									type="button"
									onClick={() => {
										setEditing(open ? null : c.id);
										setValue(
											limit ? (limit / 10 ** minorDigits(cur)).toString() : "",
										);
									}}
									className="num shrink-0 rounded-full px-3 py-1.5 text-right text-[0.92rem] hover:bg-surface-2"
								>
									{limit ? (
										<>
											<strong>{formatMinor(spent, cur)}</strong>{" "}
											<span className="text-ink-soft">
												{t("of {amount}", { amount: formatMinor(limit, cur) })}
											</span>
										</>
									) : (
										<span className="font-semibold text-plum-500">
											{t("Set limit")}
										</span>
									)}
								</button>
							</div>
							{limit ? (
								<Bar spent={spent} target={limit} tone="bg-plum-500" />
							) : null}
							{open && (
								<form
									className="mt-3 flex gap-2"
									onSubmit={(e) => {
										e.preventDefault();
										void save(c.id);
									}}
								>
									<input
										ref={(el) => el?.focus()}
										inputMode="decimal"
										aria-label={t("Monthly limit for {category}", {
											category: t(c.name),
										})}
										placeholder={t("Monthly limit")}
										value={value}
										onChange={(e) =>
											setValue(e.target.value.replace(/[^\d.,]/g, ""))
										}
										className="num h-11 min-w-0 flex-1 rounded-full border-2 border-line bg-bg px-4 outline-none focus:border-plum-500"
									/>
									<button
										type="submit"
										className="h-11 shrink-0 rounded-full bg-plum-900 px-5 font-semibold text-plum-50 dark:bg-plum-50 dark:text-plum-900"
									>
										{t("Save")}
									</button>
								</form>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
