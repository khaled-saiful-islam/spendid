import { formatMinor, hoursOfWork, WISH_COOLDOWN_HOURS } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { delightApi } from "@/lib/delight-api";
import { familyApi } from "@/lib/family-api";
import { categoriesQuery, moneyApi, summaryQuery } from "@/lib/money-api";
import { subscriptionsApi } from "@/lib/subscriptions-api";
import { formatDay } from "@/lib/time";
import { GoalJar } from "../../plan/GoalJar";
import { BrandTile, CYCLE_LABEL } from "../../subscriptions/brand";
import { IconTile, monthsUntil, Note, Row, Title } from "./parts";
import type { ActionOf, SpecMap } from "./spec";

const plan = { to: "/app/plan", label: "See it in your plan" };

function GoalBody({
	action,
	done,
}: {
	action: ActionOf<"goal">;
	done: boolean;
}) {
	const money = (m: number) => formatMinor(m, action.currency);
	const months = action.targetDate ? monthsUntil(action.targetDate) : null;
	return (
		<Row
			visual={
				<GoalJar
					ratio={done ? 0.08 : 0}
					emoji={action.emoji}
					className="h-20 w-16"
				/>
			}
		>
			<Title>{action.name}</Title>
			<p className="num font-semibold">{money(action.targetMinor)}</p>
			<Note>
				{action.targetDate && months
					? t("{amount} a month to make it by {date}.", {
							amount: money(Math.ceil(action.targetMinor / months)),
							date: formatDay(action.targetDate, {
								month: "short",
								year: "numeric",
							}),
						})
					: t("No deadline. Add whenever you like.")}
			</Note>
		</Row>
	);
}

function DepositBody({
	action,
	done,
}: {
	action: ActionOf<"deposit">;
	done: boolean;
}) {
	const money = (m: number) => formatMinor(m, action.currency);
	const after = Math.max(0, action.savedMinor + action.amountMinor);
	const ratio = (n: number) =>
		action.targetMinor > 0 ? n / action.targetMinor : 0;
	return (
		<Row
			visual={
				<GoalJar
					ratio={ratio(done ? after : action.savedMinor)}
					emoji={action.emoji}
					className="h-20 w-16"
				/>
			}
		>
			<Title>{action.goalName}</Title>
			<p className="num">
				<span className="text-ink-soft">{money(action.savedMinor)}</span>
				{" → "}
				<strong>{money(after)}</strong>
			</p>
			<Note>
				{t("{pct}% of {amount}", {
					pct: Math.min(100, Math.round(ratio(after) * 100)),
					amount: money(action.targetMinor),
				})}
				{action.jar ? ` ${t("A family jar you save into.")}` : ""}
			</Note>
		</Row>
	);
}

function BudgetBody({ action }: { action: ActionOf<"budget"> }) {
	const { data: categories = [] } = useQuery(categoriesQuery);
	const reduce = useReducedMotion();
	const cat = categories.find((c) => c.id === action.categoryId);
	const money = (m: number) => formatMinor(m, action.currency);
	const limit = action.limitMinor;
	if (limit === null)
		return (
			<Row
				visual={<CategoryIcon icon={cat?.icon} tint={cat?.tint} size="lg" />}
			>
				<Title>{t(action.categoryName)}</Title>
				<Note>
					{t("No monthly limit any more. {amount} spent so far this month.", {
						amount: money(action.spentMinor),
					})}
				</Note>
			</Row>
		);
	const share = limit > 0 ? Math.min(1, action.spentMinor / limit) : 1;
	const over = action.spentMinor > limit;
	return (
		<Row visual={<CategoryIcon icon={cat?.icon} tint={cat?.tint} size="lg" />}>
			<Title>{t(action.categoryName)}</Title>
			<p className="num font-semibold">
				{t("{amount} a month", { amount: money(limit) })}
			</p>
			<div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
				<motion.div
					className={cn("h-full rounded-full", over ? "bg-coral" : "bg-jade")}
					initial={{ width: reduce ? `${share * 100}%` : 0 }}
					animate={{ width: `${share * 100}%` }}
					transition={{ duration: 0.8, ease: "easeOut" }}
				/>
			</div>
			<Note>
				{over
					? t("Already {amount} spent this month, over this limit.", {
							amount: money(action.spentMinor),
						})
					: t("{spent} spent this month, {left} left.", {
							spent: money(action.spentMinor),
							left: money(limit - action.spentMinor),
						})}
			</Note>
		</Row>
	);
}

function WishBody({ action }: { action: ActionOf<"wish"> }) {
	const { data: summary } = useQuery(summaryQuery);
	const hours = hoursOfWork(action.priceMinor, summary?.incomeMinor ?? null);
	return (
		<Row
			visual={
				<IconTile tone="marigold">
					<Hourglass className="size-8" aria-hidden="true" />
				</IconTile>
			}
		>
			<Title>{action.name}</Title>
			<p className="num font-semibold">
				{formatMinor(action.priceMinor, action.currency)}
			</p>
			<Note>
				{hours !== null
					? t("About {n} hours of work. Wait {h} hours; most urges pass.", {
							n: hours,
							h: WISH_COOLDOWN_HOURS,
						})
					: t("Wait {h} hours; most urges pass.", { h: WISH_COOLDOWN_HOURS })}
			</Note>
		</Row>
	);
}

function SubscriptionBody({ action }: { action: ActionOf<"subscription"> }) {
	return (
		<Row
			visual={
				<BrandTile sub={{ brand: action.brand, name: action.name }} size="lg" />
			}
		>
			<Title>{action.name}</Title>
			<p className="num font-semibold">
				{t("{amount} {cycle}", {
					amount: formatMinor(action.amountMinor, action.currency),
					cycle: t(CYCLE_LABEL[action.cycle]),
				})}
			</p>
			<Note>
				{t(
					"Next payment {date}. Kept aside each month, with a reminder 3 days before.",
					{
						date: formatDay(action.nextDue, {
							day: "numeric",
							month: "short",
						}),
					},
				)}
			</Note>
		</Row>
	);
}

const money = (m: number, currency: string) =>
	formatMinor(Math.abs(m), currency);

/** Creating new things: goals, deposits, limits, subscriptions, the impulse pause. */
export const createSpecs: Pick<
	SpecMap,
	"goal" | "deposit" | "budget" | "subscription" | "wish"
> = {
	goal: {
		title: () => t("New savings goal"),
		confirm: () => t("Create goal"),
		done: (a) => t("New goal: {name}.", { name: a.name }),
		Body: GoalBody,
		run: async (a) => {
			await moneyApi.createGoal({
				name: a.name,
				emoji: a.emoji,
				targetMinor: a.targetMinor,
				targetDate: a.targetDate,
			});
			return undefined;
		},
		link: () => plan,
	},
	deposit: {
		title: (a) =>
			a.amountMinor > 0 ? t("Add to a goal") : t("Take out of a goal"),
		confirm: (a) =>
			a.amountMinor > 0
				? t("Add {amount}", { amount: money(a.amountMinor, a.currency) })
				: t("Take out {amount}", { amount: money(a.amountMinor, a.currency) }),
		done: (a) =>
			a.amountMinor > 0
				? t("Added {amount} to {name}.", {
						amount: money(a.amountMinor, a.currency),
						name: a.goalName,
					})
				: t("Took {amount} out of {name}.", {
						amount: money(a.amountMinor, a.currency),
						name: a.goalName,
					}),
		Body: DepositBody,
		run: async (a) => {
			if (a.jar) await familyApi.depositJar(a.goalId, a.amountMinor);
			else await moneyApi.depositGoal(a.goalId, a.amountMinor);
			return undefined;
		},
		link: (a) =>
			a.jar ? { to: "/app/family", label: "See it in Family" } : plan,
	},
	budget: {
		title: (a) =>
			a.limitMinor === null ? t("Remove a limit") : t("Monthly limit"),
		confirm: (a) =>
			a.limitMinor === null ? t("Remove limit") : t("Set limit"),
		done: (a) =>
			a.limitMinor === null
				? t("Limit removed for {name}.", { name: t(a.categoryName) })
				: t("Limit set for {name}.", { name: t(a.categoryName) }),
		Body: BudgetBody,
		run: async (a) => {
			await moneyApi.setBudget({
				categoryId: a.categoryId,
				monthlyLimitMinor: a.limitMinor,
			});
			return undefined;
		},
		link: () => plan,
	},
	subscription: {
		title: () => t("Subscription to track"),
		confirm: () => t("Track it"),
		done: (a) =>
			t("{name} added. You'll get a reminder before each payment.", {
				name: a.name,
			}),
		Body: SubscriptionBody,
		run: async (a) => {
			await subscriptionsApi.create({
				name: a.name,
				brand: a.brand,
				amountMinor: a.amountMinor,
				currency: a.currency,
				cycle: a.cycle,
				nextDue: a.nextDue,
				remindDays: 3,
				categoryId: a.categoryId,
			});
			return undefined;
		},
		link: () => ({ to: "/app/subscriptions", label: "See your subscriptions" }),
	},
	wish: {
		title: () => t("Impulse pause"),
		confirm: () => t("Start the {n}-hour wait", { n: WISH_COOLDOWN_HOURS }),
		done: (a) =>
			t("{name} is waiting. Decide in {n} hours.", {
				name: a.name,
				n: WISH_COOLDOWN_HOURS,
			}),
		Body: WishBody,
		run: async (a) => {
			await delightApi.addWish({
				name: a.name,
				priceMinor: a.priceMinor,
				currency: a.currency,
			});
			return undefined;
		},
		link: () => plan,
	},
};
