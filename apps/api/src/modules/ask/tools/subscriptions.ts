import {
	BILLING_CYCLES,
	type SubscriptionInputSchema,
	toMinor,
} from "@spendid/shared";
import { tool } from "langchain";
import { z } from "zod";
import {
	type AskContext,
	capitalise,
	closestWord,
	localToday,
	major,
	matchByName,
	NOT_SAVED,
	nextDayOfMonth,
	offerTo,
	type SideChannel,
	type ToolDeps,
	WordSchema,
} from "./context";

const ACTIONS = ["paid", "change", "cancel"] as const;

/** The person's tracked subscriptions: list them, mark one paid, change it or cancel it. */
export function subscriptionTools(
	deps: ToolDeps,
	ctx: AskContext,
	side: SideChannel,
) {
	const service = deps.subscriptions;
	if (!service) return [];
	const offer = offerTo(side);

	const trackedSubscriptions = tool(
		async () => {
			const o = await service.overview(ctx.userId);
			return JSON.stringify({
				currency: o.currency,
				thisMonth: major(o.thisMonthMinor, o.currency),
				stillDue: major(o.stillDueMinor, o.currency),
				perYear: major(o.yearlyMinor, o.currency),
				subscriptions: o.active.map((s) => ({
					name: s.name,
					amount: major(s.amountMinor, s.currency),
					every: s.cycle,
					nextDue: s.nextDue,
					paidThisTime: o.thisMonth.some(
						(p) => p.subscriptionId === s.id && p.paid && p.day === s.nextDue,
					),
				})),
				cancelled: o.cancelled.map((s) => s.name),
			});
		},
		{
			name: "tracked_subscriptions",
			description:
				"The subscriptions and bills the person added to Spendid: amount, how often, next payment, what's still due this month and the yearly total.",
			schema: z.object({}),
		},
	);

	const proposeSubscriptionChange = tool(
		async (input) => {
			const o = await service.overview(ctx.userId);
			const found = matchByName(o.active, input.name);
			if (!found)
				return JSON.stringify({
					error: "No tracked subscription with that name.",
					subscriptions: o.active.map((s) => s.name),
				});
			const action =
				(closestWord(input.action, ACTIONS) as (typeof ACTIONS)[number]) ??
				"change";
			if (action === "paid")
				return (
					offer({
						kind: "subscription-paid",
						subscriptionId: found.id,
						name: found.name,
						brand: found.brand,
						amountMinor:
							input.newAmount && input.newAmount > 0
								? toMinor(input.newAmount, found.currency)
								: found.amountMinor,
						currency: found.currency,
						due: found.nextDue,
					}) ?? NOT_SAVED
				);
			if (action === "cancel")
				return (
					offer({
						kind: "subscription-cancel",
						subscriptionId: found.id,
						name: found.name,
						brand: found.brand,
						amountMinor: found.amountMinor,
						currency: found.currency,
						cycle: found.cycle,
					}) ?? NOT_SAVED
				);

			const cycle =
				(closestWord(input.newCycle, BILLING_CYCLES) as
					| (typeof BILLING_CYCLES)[number]
					| null) ?? found.cycle;
			const next: z.output<typeof SubscriptionInputSchema> = {
				name: input.newName?.trim()
					? capitalise(input.newName.trim().slice(0, 60))
					: found.name,
				brand: found.brand,
				amountMinor:
					input.newAmount && input.newAmount > 0
						? toMinor(input.newAmount, found.currency)
						: found.amountMinor,
				currency: found.currency,
				amountVaries: found.amountVaries,
				cycle,
				nextDue: input.newDayOfMonth
					? nextDayOfMonth(localToday(ctx.timeZone), input.newDayOfMonth)
					: found.nextDue,
				remindDays: found.remindDays,
				categoryId: found.categoryId,
				note: found.note,
			};
			if (
				next.name === found.name &&
				next.amountMinor === found.amountMinor &&
				next.cycle === found.cycle &&
				next.nextDue === found.nextDue
			)
				return "Nothing to change was given. Ask what should change (amount, how often or the payment day).";
			return (
				offer({
					kind: "subscription-edit",
					subscriptionId: found.id,
					currency: found.currency,
					before: {
						name: found.name,
						amountMinor: found.amountMinor,
						cycle: found.cycle,
						nextDue: found.nextDue,
					},
					input: next,
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_subscription_change",
			description: `For a subscription or bill the person already tracks: mark it paid ("I paid Unifi"), change it ("Netflix is now 59.90", "gym moved to the 15th") or cancel it ("I stopped Spotify"). action: paid, change or cancel. Amounts in ${ctx.homeCurrency}. If the name isn't found you get the list.`,
			schema: z.object({
				name: z.string().min(1).max(60),
				action: WordSchema(ACTIONS),
				newAmount: z.number().positive().nullish(),
				newCycle: WordSchema(BILLING_CYCLES).nullish(),
				newDayOfMonth: z.number().int().min(1).max(31).nullish(),
				newName: z.string().max(60).nullish(),
			}),
		},
	);

	return [trackedSubscriptions, proposeSubscriptionChange];
}
