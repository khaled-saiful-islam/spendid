import { profile, user } from "@spendid/db";
import { type BUDGET_METHODS, toMinor } from "@spendid/shared";
import { eq } from "drizzle-orm";
import { tool } from "langchain";
import { z } from "zod";
import {
	type AskContext,
	closestWord,
	NOT_SAVED,
	offerTo,
	type SideChannel,
	type ToolDeps,
	WordSchema,
} from "./context";

/** Plain words for the budget styles; ILMU picks one of these. */
const STYLE_WORDS: Record<string, (typeof BUDGET_METHODS)[number]> = {
	"50/30/20": "fifty_thirty_twenty",
	"fifty-thirty-twenty": "fifty_thirty_twenty",
	envelope: "envelope",
	envelopes: "envelope",
	"zero-based": "zero_based",
	zero: "zero_based",
	"pay yourself first": "pay_yourself_first",
	"pay-yourself-first": "pay_yourself_first",
	"transfers first": "pay_yourself_first",
};

/** Change monthly income or budget style (Plan's settings), as a card to confirm. */
export function planTools(deps: ToolDeps, ctx: AskContext, side: SideChannel) {
	const { db } = deps;
	const cur = ctx.homeCurrency;
	const offer = offerTo(side);

	const proposePlanChange = tool(
		async (input) => {
			const [row] = await db
				.select({ p: profile, name: user.name })
				.from(profile)
				.innerJoin(user, eq(user.id, profile.userId))
				.where(eq(profile.userId, ctx.userId))
				.limit(1);
			if (!row) return "The person's plan isn't set up yet.";
			const { p } = row;
			const styleWord = closestWord(input.style, Object.keys(STYLE_WORDS));
			const method = styleWord ? STYLE_WORDS[styleWord] : p.budgetMethod;
			const incomeMinor =
				input.monthlyIncome !== null && input.monthlyIncome !== undefined
					? toMinor(input.monthlyIncome, cur)
					: p.monthlyIncomeMinor;
			if (method === p.budgetMethod && incomeMinor === p.monthlyIncomeMinor)
				return "Nothing to change was given. Ask for the new monthly income or budget style.";
			return (
				offer({
					kind: "plan",
					currency: cur,
					before: {
						incomeMinor: p.monthlyIncomeMinor,
						method: p.budgetMethod,
					},
					input: {
						name: row.name,
						homeCurrency: p.homeCurrency,
						locale: p.locale as "en" | "ms",
						timeZone: p.timeZone,
						monthlyIncomeMinor: incomeMinor,
						budgetMethod: method ?? p.budgetMethod,
					},
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_plan_change",
			description: `Change the person's monthly take-home income ("my salary is now 6000") or budget style ("switch to envelopes"): 50/30/20, envelope, zero-based or pay yourself first (salary minus monthly transfers is what's left to spend). Amount in ${cur}. Safe-to-spend is worked out from these.`,
			schema: z.object({
				monthlyIncome: z.number().min(0).nullish(),
				style: WordSchema(Object.keys(STYLE_WORDS)).nullish(),
			}),
		},
	);

	return [proposePlanChange];
}
