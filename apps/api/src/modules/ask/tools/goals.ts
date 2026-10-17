import { toMinor } from "@spendid/shared";
import { tool } from "langchain";
import { z } from "zod";
import {
	type AskContext,
	capitalise,
	endOfMonth,
	localToday,
	matchByName,
	NOT_SAVED,
	offerTo,
	type SideChannel,
	type ToolDeps,
} from "./context";

/** Change a goal's target, deadline or name, or archive it. */
export function goalTools(deps: ToolDeps, ctx: AskContext, side: SideChannel) {
	const cur = ctx.homeCurrency;
	const offer = offerTo(side);

	const proposeGoalChange = tool(
		async (input) => {
			const goals = await deps.plan.goals(ctx.userId);
			const found = matchByName(goals, input.goal);
			if (!found)
				return JSON.stringify({
					error: "No goal with that name.",
					goals: goals.map((g) => g.name),
				});
			if (input.archive)
				return (
					offer({
						kind: "goal-archive",
						goalId: found.id,
						goalName: found.name,
						emoji: found.emoji,
						currency: cur,
						savedMinor: found.savedMinor,
						targetMinor: found.targetMinor,
					}) ?? NOT_SAVED
				);

			const targetMinor =
				input.newTarget && input.newTarget > 0
					? toMinor(input.newTarget, cur)
					: found.targetMinor;
			let targetDate = found.targetDate;
			if (input.noDeadline) targetDate = null;
			else if (input.byYear) {
				targetDate = endOfMonth(input.byYear, input.byMonth ?? 12);
				if (targetDate <= localToday(ctx.timeZone))
					return "That date has passed. Ask for a date in the future.";
			}
			const name = input.newName?.trim()
				? capitalise(input.newName.trim().slice(0, 60))
				: found.name;
			if (
				targetMinor === found.targetMinor &&
				targetDate === found.targetDate &&
				name === found.name
			)
				return "Nothing to change was given. Ask what should change (target, date or name), or whether to archive it.";
			return (
				offer({
					kind: "goal-edit",
					goalId: found.id,
					currency: cur,
					savedMinor: found.savedMinor,
					before: {
						name: found.name,
						emoji: found.emoji,
						targetMinor: found.targetMinor,
						targetDate: found.targetDate,
					},
					input: { name, emoji: found.emoji, targetMinor, targetDate },
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_goal_change",
			description: `Change one of the person's savings goals: a new target ("make the laptop goal 6000"), a new deadline (byYear, byMonth 1-12) or none (noDeadline), a new name, or archive it when they're done or giving up. Amounts in ${cur}. To put money in or take it out, use propose_goal_deposit instead.`,
			schema: z.object({
				goal: z.string().min(1).max(60),
				newTarget: z.number().positive().nullish(),
				byYear: z.number().int().min(2000).max(2100).nullish(),
				byMonth: z.number().int().min(1).max(12).nullish(),
				noDeadline: z.boolean().nullish(),
				newName: z.string().max(60).nullish(),
				archive: z.boolean().nullish(),
			}),
		},
	);

	return [proposeGoalChange];
}
