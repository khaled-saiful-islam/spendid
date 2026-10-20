import { toMinor } from "@spendid/shared";
import { tool } from "langchain";
import { z } from "zod";
import { recurringFor } from "../../insights/charges";
import { isGrounded } from "../grounding";
import { calculateTool } from "./calculate";
import {
	type AskContext,
	localToday,
	major,
	type SideChannel,
	type ToolDeps,
} from "./context";
import { spendingTools } from "./spending";

/** Read-only views of the person's own money, plus show_chart. Nothing here writes. */
export function readTools(deps: ToolDeps, ctx: AskContext, side: SideChannel) {
	const { db } = deps;
	const cur = ctx.homeCurrency;

	const budgetOverview = tool(
		async () => {
			const s = await deps.summary.forUser(ctx.userId);
			// This month so far, by category, and today: what its numbers cover.
			const today = ctx.today ?? localToday(ctx.timeZone);
			side.lookups ??= [];
			side.lookups.push(
				{ from: `${today.slice(0, 8)}01`, to: today, groupBy: "category" },
				{ from: today, to: today, groupBy: "category" },
			);
			const limits = await deps.plan.budgets(ctx.userId);
			const byId = new Map(ctx.categories.map((c) => [c.id, c]));
			const spent = new Map(
				s.byCategory.map((c) => [c.categoryId, c.spentMinor]),
			);
			return JSON.stringify({
				currency: cur,
				budgetStyle: s.method ?? "none chosen yet",
				monthlyIncome:
					s.incomeMinor === null ? null : major(s.incomeMinor, cur),
				...(s.method === "pay_yourself_first"
					? {
							// Pay yourself first: these go out when salary lands; the rest is to spend.
							transfersOutFirst: s.transfers.map((t) => ({
								name: t.name,
								amount: major(t.amountMinor, cur),
							})),
							transfersTotal: major(s.reservedMinor, cur),
						}
					: { keptAsideForSavings: major(s.reservedMinor, cur) }),
				safeToSpendToday: major(s.safe.safeTodayMinor, cur),
				dailyAllowance: major(s.safe.dailyAllowanceMinor, cur),
				daysLeftInMonth: s.daysLeft,
				spentThisMonth: major(s.monthSpentMinor, cur),
				leftThisMonth: major(s.safe.leftThisMonthMinor, cur),
				categoryLimits: limits.map((l) => ({
					category: byId.get(l.categoryId)?.name ?? "Other",
					limit: major(l.monthlyLimitMinor, cur),
					spent: major(spent.get(l.categoryId) ?? 0, cur),
				})),
			});
		},
		{
			name: "budget_overview",
			description:
				"This month's plan: income, savings kept aside (or, for pay yourself first, the monthly transfers), safe to spend today, days left, spent so far, and any category limits.",
			schema: z.object({}),
		},
	);

	const goalsOverview = tool(
		async () => {
			const goals = await deps.plan.goals(ctx.userId);
			return JSON.stringify({
				currency: cur,
				goals: goals.map((g) => ({
					name: g.name,
					saved: major(g.savedMinor, cur),
					target: major(g.targetMinor, cur),
					byDate: g.targetDate,
					neededPerMonth: major(g.monthlyNeededMinor, cur),
				})),
			});
		},
		{
			name: "goals_overview",
			description:
				"Savings goals with saved, target, deadline and the monthly amount needed.",
			schema: z.object({}),
		},
	);

	const billsAndSubscriptions = tool(
		async () => {
			const r = await recurringFor(db, ctx.userId);
			return JSON.stringify({
				currency: cur,
				monthlyTotal: major(r.monthlyMinor, cur),
				stillDueThisMonth: {
					total: major(r.billsDue.minor, cur),
					items: r.billsDue.items.map((b) => ({
						shop: b.merchant,
						on: b.day,
						amount: major(b.amountMinor, cur),
					})),
				},
				recurring: r.items.map((i) => ({
					shop: i.merchant,
					every: i.cadence,
					amount: major(i.amountMinor, cur),
					previousAmount:
						i.previousAmountMinor === null
							? null
							: major(i.previousAmountMinor, cur),
					lastCharged: i.lastDay,
					nextExpected: i.nextDay,
					category: i.categoryName,
				})),
			});
		},
		{
			name: "bills_and_subscriptions",
			description:
				"Subscriptions and bills found from repeating charges: how often, amount (and previous amount if the price changed), last and next date, and which are still due this month. Use for questions about bills, subscriptions, recurring payments or what's coming up.",
			schema: z.object({}),
		},
	);

	const showChart = tool(
		async (input) => {
			if (side.charts.length >= 2)
				return "Two charts are already shown; describe the rest in words.";
			const made = input.points.filter(
				(p) => !isGrounded(p.value, side.sources ?? []),
			);
			if (made.length)
				return `Not shown: ${made.map((p) => `${p.label} ${p.value}`).join(", ")} ${made.length === 1 ? "is" : "are"} not from the tools. Chart only numbers a tool returned, exactly.`;
			side.charts.push({
				kind: input.kind,
				title: input.title,
				currency: cur,
				points: input.points.map((p) => ({
					label: p.label.slice(0, 40),
					value: toMinor(p.value, cur),
				})),
			});
			return "The chart is now shown to the person. Refer to it briefly; don't repeat every number.";
		},
		{
			name: "show_chart",
			description:
				"Show a chart next to your answer. Use 'bar' for comparing categories, shops or months; 'line' for how spending changed day by day or week by week. Values in the home currency. Use only numbers you got from other tools.",
			schema: z.object({
				kind: z.enum(["bar", "line"]),
				title: z.string().max(80),
				points: z
					.array(z.object({ label: z.string(), value: z.number() }))
					.min(1)
					.max(31),
			}),
		},
	);

	return [
		...spendingTools(deps, ctx, side),
		calculateTool(),
		budgetOverview,
		goalsOverview,
		billsAndSubscriptions,
		showChart,
	];
}
