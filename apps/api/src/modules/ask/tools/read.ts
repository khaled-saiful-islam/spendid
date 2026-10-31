import { toMinor } from "@spendid/shared";
import { tool } from "langchain";
import { z } from "zod";
import { recurringFor } from "../../insights/charges";
import { periodBounds } from "../../money/period";
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

/** The plan in the words people use, so answers never show an internal id. */
const STYLE_NAME: Record<string, string> = {
	fifty_thirty_twenty: "50/30/20",
	envelope: "envelopes",
	zero_based: "every bit has a job (zero-based)",
	pay_yourself_first: "pay yourself first",
};

/** Read-only views of the person's own money, plus show_chart. Nothing here writes. */
export function readTools(deps: ToolDeps, ctx: AskContext, side: SideChannel) {
	const { db } = deps;
	const cur = ctx.homeCurrency;

	const budgetOverview = tool(
		async () => {
			const s = await deps.summary.forUser(ctx.userId);
			side.planRead = true;
			// The period so far (month or cycle), by category, and today: what its numbers cover.
			const today = ctx.today ?? localToday(ctx.timeZone);
			side.lookups ??= [];
			side.lookups.push(
				{ from: s.period.start, to: today, groupBy: "category" },
				{ from: today, to: today, groupBy: "category" },
			);
			const limits = await deps.plan.budgets(ctx.userId);
			const byId = new Map(ctx.categories.map((c) => [c.id, c]));
			const spent = new Map(
				s.byCategory.map((c) => [c.categoryId, c.spentMinor]),
			);
			// Cycle users get cycle names, so an answer never calls a cycle "this month".
			const cycle = s.period.kind === "cycle";
			const n = (month: string, cycleName: string) =>
				cycle ? cycleName : month;
			return JSON.stringify({
				currency: cur,
				...(cycle
					? {
							period: {
								kind: "cycle",
								from: s.period.start,
								to: s.period.end,
								...(s.period.status === "draft"
									? { note: "drafted by Spendid, not confirmed yet" }
									: {}),
							},
						}
					: {}),
				budgetStyle: s.method
					? (STYLE_NAME[s.method] ?? s.method)
					: "none chosen yet",
				[n("monthlyIncome", "incomeThisCycle")]:
					s.incomeMinor === null ? null : major(s.incomeMinor, cur),
				...(s.method === "pay_yourself_first"
					? {
							// Pay yourself first: these go out when salary lands; the rest is to spend.
							[n("monthlyTransfersOutFirst", "transfersOutFirstEachCycle")]:
								s.transfers.map((t) => ({
									name: t.name,
									amount: major(t.amountMinor, cur),
								})),
							[n("monthlyTransfersTotal", "transfersTotalEachCycle")]: major(
								s.reservedMinor,
								cur,
							),
							incomeLeftAfterTransfers:
								s.incomeMinor === null
									? null
									: major(s.incomeMinor - s.reservedMinor, cur),
						}
					: {
							keptAsideForSavings: major(s.reservedMinor, cur),
							[n("monthlyTransfers", "transfers")]: cycle
								? "none: this plan has no transfers"
								: "none: this plan has no monthly transfers",
						}),
				safeToSpendToday: major(s.safe.safeTodayMinor, cur),
				dailyAllowance: major(s.safe.dailyAllowanceMinor, cur),
				[n("daysLeftInMonth", "daysLeftInCycle")]: s.daysLeft,
				[n("spentThisMonth", "spentThisCycle")]: major(s.monthSpentMinor, cur),
				[n("leftThisMonth", "leftThisCycle")]: major(
					s.safe.leftThisMonthMinor,
					cur,
				),
				categoryLimits: limits.map((l) => ({
					category: byId.get(l.categoryId)?.name ?? "Other",
					[n("limit", "limitPerCycle")]: major(l.monthlyLimitMinor, cur),
					spent: major(spent.get(l.categoryId) ?? 0, cur),
				})),
			});
		},
		{
			name: "budget_overview",
			description:
				"The person's plan and current period (the calendar month, or their cycle with its dates): budget style, income, savings kept aside, safe to spend today, days left, spent so far, category limits. Also the ONLY source for transfers (pindahan bulanan: savings, family, ASB sent out when salary lands, in the pay yourself first plan) and the income left after them. Transfers are planned amounts, not expenses: never look for them with the spending tools.",
			schema: z.object({}),
		},
	);

	const goalsOverview = tool(
		async () => {
			const goals = await deps.plan.goals(ctx.userId);
			// A goal's need is per period: the person's cycle, or the month.
			const cycle = (await periodBounds(db, ctx.userId)).kind === "cycle";
			return JSON.stringify({
				currency: cur,
				goals: goals.map((g) => ({
					name: g.name,
					saved: major(g.savedMinor, cur),
					target: major(g.targetMinor, cur),
					byDate: g.targetDate,
					[cycle ? "neededPerCycle" : "neededPerMonth"]: major(
						g.monthlyNeededMinor,
						cur,
					),
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
