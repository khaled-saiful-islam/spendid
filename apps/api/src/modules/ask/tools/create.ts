import { MAX_DAYS_BACK, SUBSCRIPTION_BRANDS, toMinor } from "@spendid/shared";
import { tool } from "langchain";
import { z } from "zod";
import {
	type AskContext,
	CategoryWord,
	CYCLE_WORDS,
	capitalise,
	closestWord,
	endOfMonth,
	GOAL_ICON_WORDS,
	GOAL_ICONS,
	localToday,
	matchByName,
	NOT_SAVED,
	nextDayOfMonth,
	offerTo,
	type SideChannel,
	SLUGS,
	type ToolDeps,
	unknownCategory,
} from "./context";

/** Prepare new things as cards to confirm: expenses, goals, deposits, limits, wishes, subscriptions. */
export function createTools(
	deps: ToolDeps,
	ctx: AskContext,
	side: SideChannel,
) {
	const cur = ctx.homeCurrency;
	const offer = offerTo(side);
	const proposeExpenses = tool(
		async (input) => {
			const bySlug = new Map(ctx.categories.map((c) => [c.slug, c]));
			for (const e of input.expenses) {
				const currency = e.currency?.toUpperCase() ?? cur;
				side.drafts.push({
					amountMinor: toMinor(e.amount, currency),
					currency,
					merchant:
						e.description.charAt(0).toUpperCase() + e.description.slice(1),
					categoryId:
						(
							bySlug.get(closestWord(e.category, SLUGS) ?? "other") ??
							bySlug.get("other")
						)?.id ?? null,
					daysAgo: e.daysAgo,
					note: null,
				});
			}
			return "Shown to the person as cards to confirm. They are NOT saved until the person taps Add. Say so briefly.";
		},
		{
			name: "propose_expenses",
			description:
				"When the person tells you about purchases to log, prepare them as cards for the person to confirm. Never claim they are saved.",
			schema: z.object({
				expenses: z
					.array(
						z.object({
							amount: z.number().positive(),
							currency: z.string().length(3).nullable(),
							description: z.string().max(60),
							category: CategoryWord,
							daysAgo: z
								.number()
								.int()
								.min(0)
								.max(MAX_DAYS_BACK)
								.describe(
									"Days before today: 0 today, 1 yesterday; for a weekday or a date, count back from today",
								),
						}),
					)
					.min(1)
					.max(10),
			}),
		},
	);

	const proposeGoal = tool(
		async (input) => {
			const targetMinor = toMinor(input.target, cur);
			if (targetMinor <= 0) return "The target must be above zero. Ask for it.";
			const targetDate = input.byYear
				? endOfMonth(input.byYear, input.byMonth ?? 12)
				: null;
			if (targetDate && targetDate <= new Date().toISOString().slice(0, 10))
				return "That date has passed. Ask for a date in the future.";
			return (
				offer({
					kind: "goal",
					name: capitalise(input.name.trim().slice(0, 60)),
					emoji:
						GOAL_ICONS[closestWord(input.icon, GOAL_ICON_WORDS) ?? "other"] ??
						"🎯",
					targetMinor,
					currency: cur,
					targetDate,
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_goal",
			description: `Prepare a new savings goal for the person to confirm (e.g. "save 5000 for a laptop by June 2027"). Amount in ${cur}. byYear and byMonth (1-12) are optional, for a deadline. Pick the icon word that fits best.`,
			schema: z.object({
				name: z.string().min(1).max(60),
				target: z.number().positive(),
				byYear: z.number().int().min(2000).max(2100).nullish(),
				byMonth: z.number().int().min(1).max(12).nullish(),
				icon: z
					.string()
					.describe(`One of: ${GOAL_ICON_WORDS.join(", ")}`)
					.nullish(),
			}),
		},
	);

	const proposeGoalDeposit = tool(
		async (input) => {
			const [goals, shared] = await Promise.all([
				deps.plan.goals(ctx.userId),
				deps.jars?.overview(ctx.userId),
			]);
			// Their own goals first, then family jars they save into.
			const jars = (shared?.jars ?? []).filter((j) => !j.mine);
			const own = matchByName(goals, input.goal);
			const jar = own ? null : matchByName(jars, input.goal);
			const found = own ?? jar;
			if (!found)
				return JSON.stringify({
					error: "No goal with that name.",
					goals: [...goals.map((g) => g.name), ...jars.map((j) => j.name)],
				});
			if (jar && input.takeOut)
				return `Only ${jar.ownerName} can take money out of ${jar.name}.`;
			const currency = jar?.currency ?? cur;
			const amountMinor =
				toMinor(input.amount, currency) * (input.takeOut ? -1 : 1);
			if (amountMinor === 0) return "The amount must not be zero. Ask for it.";
			return (
				offer({
					kind: "deposit",
					goalId: found.id,
					goalName: found.name,
					emoji: found.emoji,
					amountMinor,
					currency,
					savedMinor: found.savedMinor,
					targetMinor: found.targetMinor,
					...(jar && { jar: true }),
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_goal_deposit",
			description: `Prepare money going into (or, with takeOut, out of) one of the person's goals, or a family jar they save into, for them to confirm. Amount in ${cur}. If the goal isn't found you get the list of names; ask which one.`,
			schema: z.object({
				goal: z.string().min(1).max(60),
				amount: z.number().positive(),
				takeOut: z.boolean().nullish(),
			}),
		},
	);

	const proposeBudget = tool(
		async (input) => {
			const slug = closestWord(input.category, SLUGS);
			const found = ctx.categories.find((c) => c.slug === slug);
			if (!found) return unknownCategory();
			if (
				!input.remove &&
				(input.monthlyLimit === null || input.monthlyLimit === undefined)
			)
				return "Ask what the monthly limit should be.";
			const s = await deps.summary.forUser(ctx.userId);
			return (
				offer({
					kind: "budget",
					categoryId: found.id,
					categoryName: found.name,
					limitMinor: input.remove
						? null
						: toMinor(input.monthlyLimit ?? 0, cur),
					currency: cur,
					spentMinor:
						s.byCategory.find((c) => c.categoryId === found.id)?.spentMinor ??
						0,
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_budget",
			description: `Prepare a monthly spending limit for one category, for the person to confirm (e.g. "cap eating out at 400 a month"), or remove one (remove: true). Amount in ${cur}; 0 means no spending at all in it.`,
			schema: z.object({
				category: CategoryWord,
				monthlyLimit: z.number().min(0).nullish(),
				remove: z.boolean().nullish(),
			}),
		},
	);

	const proposeSubscription = tool(
		async (input) => {
			const amountMinor = toMinor(input.amount, cur);
			if (amountMinor <= 0) return "The amount must be above zero. Ask for it.";
			const brand = SUBSCRIPTION_BRANDS.find(
				(b) =>
					b.key ===
					closestWord(
						input.name.replace(/\s+/g, ""),
						SUBSCRIPTION_BRANDS.map((x) => x.key),
					),
			);
			const slug =
				brand?.slug ?? closestWord(input.category, SLUGS) ?? "subscriptions";
			const category =
				ctx.categories.find((c) => c.slug === slug) ??
				ctx.categories.find((c) => c.slug === "subscriptions");
			if (!category) return unknownCategory();
			const today = localToday(ctx.timeZone);
			const nextDue = input.dayOfMonth
				? nextDayOfMonth(today, input.dayOfMonth)
				: today;
			return (
				offer({
					kind: "subscription",
					name: capitalise(input.name.trim().slice(0, 60)),
					brand: brand?.key ?? null,
					amountMinor,
					currency: cur,
					cycle:
						(closestWord(
							input.cycle,
							CYCLE_WORDS,
						) as (typeof CYCLE_WORDS)[number]) ?? "monthly",
					nextDue,
					categoryId: category.id,
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_subscription",
			description: `Prepare a subscription or regular bill to track (e.g. "Netflix 54.90 every month on the 5th", "gym 35 weekly"). Amount in ${cur}. cycle: weekly, monthly, quarterly or yearly. dayOfMonth (1-31) is the next payment day if known. Spendid keeps it aside and reminds the person before each payment.`,
			schema: z.object({
				name: z.string().min(1).max(60),
				amount: z.number().positive(),
				cycle: z.string().describe("weekly, monthly, quarterly or yearly"),
				dayOfMonth: z.number().int().min(1).max(31).nullish(),
				category: CategoryWord.nullish(),
			}),
		},
	);

	const proposeWish = tool(
		async (input) => {
			const priceMinor = toMinor(input.price, cur);
			if (priceMinor <= 0) return "The price must be above zero. Ask for it.";
			return (
				offer({
					kind: "wish",
					name: capitalise(input.name.trim().slice(0, 80)),
					priceMinor,
					currency: cur,
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_wish",
			description: `When the person is tempted to buy something ("should I buy the new headphones for 899?"), offer to park it in the 48-hour impulse pause. Price in ${cur}.`,
			schema: z.object({
				name: z.string().min(1).max(80),
				price: z.number().positive(),
			}),
		},
	);

	return [
		proposeExpenses,
		proposeGoal,
		proposeGoalDeposit,
		proposeBudget,
		proposeWish,
		proposeSubscription,
	];
}
