import type { StructuredToolInterface } from "@langchain/core/tools";
import { challengeTools } from "./challenges";
import type { AskContext, SideChannel, ToolDeps } from "./context";
import { createTools } from "./create";
import { expenseTools } from "./expenses";
import { familyTools } from "./family";
import { goalTools } from "./goals";
import { planTools } from "./plan";
import { readTools } from "./read";
import { receiptTools } from "./receipt";
import type { Area } from "./router";
import { settingsTools } from "./settings";
import { subscriptionTools } from "./subscriptions";

export * from "./context";
export { receiptNote } from "./receipt";
export { AREAS, type Area, pickAreas } from "./router";

/** Any of the tools: they differ in input schema only. */
type AskTool = StructuredToolInterface;

/**
 * The assistant's tools for one question. Read tools look at the person's own money; propose
 * tools only prepare cards. Every change waits for the person's tap, and the person's id comes
 * from the session, never from the model.
 *
 * With `areas`, only the everyday tools plus those areas' tools are given (ILMU picks the right
 * tool more reliably from a short list). No areas found: the everyday create tools, as before.
 * Without `areas`: every tool.
 */
export function createAskTools(
	deps: ToolDeps,
	ctx: AskContext,
	side: SideChannel,
	areas?: Set<Area>,
): AskTool[] {
	const read = readTools(deps, ctx, side);
	const create = createTools(deps, ctx, side);
	const pick = (...names: string[]) =>
		create.filter((t) => names.includes(t.name));
	const area = {
		expenses: () => expenseTools(deps, ctx, side),
		subscriptions: () => [
			...pick("propose_subscription"),
			...subscriptionTools(deps, ctx, side),
		],
		goals: () => [
			...pick("propose_goal", "propose_goal_deposit"),
			...goalTools(deps, ctx, side),
		],
		plan: () => [...pick("propose_budget"), ...planTools(deps, ctx, side)],
		challenges: () => challengeTools(deps, ctx, side),
		// Family jars take deposits too.
		family: () => [
			...familyTools(deps, ctx, side),
			...pick("propose_goal_deposit"),
		],
		settings: () =>
			settingsTools(deps, ctx, side).filter((t) => t.name !== "propose_export"),
		data: () =>
			settingsTools(deps, ctx, side).filter((t) => t.name === "propose_export"),
		receipt: () => [
			...receiptTools(ctx, side),
			...familyTools(deps, ctx, side).filter((t) => t.name === "propose_split"),
		],
	} satisfies Record<Area, () => AskTool[]>;

	const all = (fs: (() => AskTool[])[]) => fs.flatMap((f): AskTool[] => f());
	const chosen: AskTool[] = !areas
		? [...read, ...create, ...all(Object.values(area))]
		: areas.size === 0
			? [...read, ...create]
			: [
					...read,
					...pick("propose_expenses", "propose_wish"),
					...all([...areas].map((a) => area[a])),
				];
	// One of each name (areas can share a tool).
	const seen = new Set<string>();
	return chosen.filter((t) => !seen.has(t.name) && seen.add(t.name));
}

/** One line per available propose tool, for the system prompt (only tools that are present). */
const CAPABILITIES: Record<string, string> = {
	propose_expenses: "log purchases the person describes (propose_expenses)",
	propose_goal: "a new savings goal (propose_goal)",
	propose_goal_deposit:
		"money into or out of a goal or family jar (propose_goal_deposit)",
	propose_budget:
		"set or remove a monthly limit for a category (propose_budget)",
	propose_wish: "park a tempting purchase for 48 hours (propose_wish)",
	propose_subscription:
		"a new subscription or regular bill to track (propose_subscription)",
	propose_expense_change: "fix or delete an expense (propose_expense_change)",
	propose_subscription_change:
		"mark a tracked subscription paid, change it or cancel it (propose_subscription_change)",
	propose_goal_change:
		"change a goal's target, date or name, or archive it (propose_goal_change)",
	propose_plan_change:
		"change monthly income or budget style (propose_plan_change)",
	propose_challenge: "start or stop a challenge (propose_challenge)",
	propose_sharing:
		"change or pause what they share with someone in their circle (propose_sharing)",
	propose_invite: "invite someone into the family circle (propose_invite)",
	propose_split:
		"split a bill with others, or the attached receipt (propose_split)",
	propose_setting:
		"change language, hidden amounts, quiet hours or emails (propose_setting)",
	propose_export: "download a copy of all their data (propose_export)",
	propose_receipt_review:
		"check and save the attached receipt as an expense (propose_receipt_review)",
};

export function capabilityLines(tools: { name: string }[]): string {
	return tools
		.map((t) => CAPABILITIES[t.name])
		.filter(Boolean)
		.map((line) => `  - ${line}`)
		.join("\n");
}

/** Friendly progress labels for the app while a tool runs (translated in the app). */
export const STEP_LABELS: Record<string, string> = {
	spending_totals: "Adding up your spending…",
	find_expenses: "Looking through your expenses…",
	budget_overview: "Checking your budget…",
	goals_overview: "Checking your goals…",
	bills_and_subscriptions: "Checking your bills and subscriptions…",
	show_chart: "Drawing a chart…",
	propose_expenses: "Preparing cards to confirm…",
	propose_goal: "Preparing your goal…",
	propose_goal_deposit: "Finding your goal…",
	propose_budget: "Preparing your limit…",
	propose_wish: "Preparing the impulse pause…",
	propose_subscription: "Preparing your subscription…",
	propose_expense_change: "Finding that expense…",
	tracked_subscriptions: "Checking your subscriptions…",
	propose_subscription_change: "Preparing the change…",
	propose_goal_change: "Preparing the change…",
	propose_plan_change: "Preparing your plan…",
	challenges_overview: "Checking your challenges…",
	propose_challenge: "Preparing the challenge…",
	family_overview: "Checking your family circle…",
	propose_sharing: "Preparing the change…",
	propose_invite: "Preparing the invite…",
	propose_split: "Working out the shares…",
	settings_overview: "Checking your settings…",
	propose_setting: "Preparing the change…",
	propose_export: "Preparing your download…",
	propose_receipt_review: "Reading your receipt…",
};
