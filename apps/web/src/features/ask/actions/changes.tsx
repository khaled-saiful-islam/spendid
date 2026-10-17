import { type BudgetMethod, formatMinor } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Archive, Trash2, Wallet } from "lucide-react";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { saveProfile } from "@/lib/me";
import { categoriesQuery, moneyApi } from "@/lib/money-api";
import { subscriptionsApi } from "@/lib/subscriptions-api";
import { METHODS } from "../../onboarding/options";
import { GoalJar } from "../../plan/GoalJar";
import { BrandTile, CYCLE_LABEL } from "../../subscriptions/brand";
import {
	Change,
	dayLabel,
	IconTile,
	monthLabel,
	Note,
	Row,
	Title,
} from "./parts";
import type { ActionOf, SpecMap } from "./spec";

const activity = { to: "/app/activity", label: "See it in Activity" };
const subscriptions = {
	to: "/app/subscriptions",
	label: "See your subscriptions",
};
const plan = { to: "/app/plan", label: "See it in your plan" };

function CategoryVisual({ name }: { name: string }) {
	const { data: categories = [] } = useQuery(categoriesQuery);
	const cat = categories.find((c) => c.name === name);
	return <CategoryIcon icon={cat?.icon} tint={cat?.tint} size="lg" />;
}

function ExpenseEditBody({ action }: { action: ActionOf<"expense-edit"> }) {
	const { before: b, after: a } = action;
	const money = (m: number) => formatMinor(m, action.currency);
	return (
		<Row visual={<CategoryVisual name={a.categoryName} />}>
			<Title>{a.merchant ?? t(a.categoryName)}</Title>
			{b.amountMinor !== a.amountMinor && (
				<Change from={money(b.amountMinor)} to={money(a.amountMinor)} />
			)}
			{b.categoryName !== a.categoryName && (
				<Change from={t(b.categoryName)} to={t(a.categoryName)} />
			)}
			{b.merchant !== a.merchant && (
				<Change from={b.merchant ?? "—"} to={a.merchant ?? "—"} />
			)}
			{b.day !== a.day && (
				<Change from={dayLabel(b.day)} to={dayLabel(a.day)} />
			)}
			<Note>{t("From {day}.", { day: dayLabel(b.day) })}</Note>
		</Row>
	);
}

function ExpenseDeleteBody({ action }: { action: ActionOf<"expense-delete"> }) {
	const l = action.look;
	return (
		<Row
			visual={
				<IconTile tone="coral">
					<Trash2 className="size-7" aria-hidden="true" />
				</IconTile>
			}
		>
			<Title>{l.merchant ?? t(l.categoryName)}</Title>
			<p className="num font-semibold">
				{formatMinor(l.amountMinor, action.currency)}
			</p>
			<Note>{`${t(l.categoryName)}, ${dayLabel(l.day)}`}</Note>
		</Row>
	);
}

function SubscriptionPaidBody({
	action,
}: {
	action: ActionOf<"subscription-paid">;
}) {
	return (
		<Row
			visual={
				<BrandTile sub={{ brand: action.brand, name: action.name }} size="lg" />
			}
		>
			<Title>{action.name}</Title>
			<p className="num font-semibold">
				{formatMinor(action.amountMinor, action.currency)}
			</p>
			<Note>
				{t("Due {date}. Logged as an expense, and the next payment moves on.", {
					date: dayLabel(action.due),
				})}
			</Note>
		</Row>
	);
}

function SubscriptionEditBody({
	action,
}: {
	action: ActionOf<"subscription-edit">;
}) {
	const { before: b, input: n } = action;
	const money = (m: number) => formatMinor(m, action.currency);
	return (
		<Row
			visual={
				<BrandTile sub={{ brand: n.brand ?? null, name: n.name }} size="lg" />
			}
		>
			<Title>{n.name}</Title>
			{b.name !== n.name && <Change from={b.name} to={n.name} />}
			{b.amountMinor !== n.amountMinor && (
				<Change from={money(b.amountMinor)} to={money(n.amountMinor)} />
			)}
			{b.cycle !== n.cycle && n.cycle && (
				<Change from={t(CYCLE_LABEL[b.cycle])} to={t(CYCLE_LABEL[n.cycle])} />
			)}
			{b.nextDue !== n.nextDue && (
				<Change from={dayLabel(b.nextDue)} to={dayLabel(n.nextDue)} />
			)}
		</Row>
	);
}

function SubscriptionCancelBody({
	action,
}: {
	action: ActionOf<"subscription-cancel">;
}) {
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
				{t("No more reminders, and it's no longer kept aside each month.")}
			</Note>
		</Row>
	);
}

function GoalEditBody({
	action,
	done,
}: {
	action: ActionOf<"goal-edit">;
	done: boolean;
}) {
	const { before: b, input: n } = action;
	const money = (m: number) => formatMinor(m, action.currency);
	const target = done ? n.targetMinor : b.targetMinor;
	const newDate = n.targetDate ?? null;
	return (
		<Row
			visual={
				<GoalJar
					ratio={target > 0 ? action.savedMinor / target : 0}
					emoji={b.emoji}
					className="h-20 w-16"
				/>
			}
		>
			<Title>{n.name}</Title>
			{b.name !== n.name && <Change from={b.name} to={n.name} />}
			{b.targetMinor !== n.targetMinor && (
				<Change from={money(b.targetMinor)} to={money(n.targetMinor)} />
			)}
			{b.targetDate !== newDate && (
				<Change
					from={b.targetDate ? monthLabel(b.targetDate) : t("No deadline")}
					to={newDate ? monthLabel(newDate) : t("No deadline")}
				/>
			)}
			<Note>
				{t("{amount} saved so far.", { amount: money(action.savedMinor) })}
			</Note>
		</Row>
	);
}

function GoalArchiveBody({ action }: { action: ActionOf<"goal-archive"> }) {
	const money = (m: number) => formatMinor(m, action.currency);
	return (
		<Row
			visual={
				<span className="relative">
					<GoalJar
						ratio={
							action.targetMinor > 0
								? action.savedMinor / action.targetMinor
								: 0
						}
						emoji={action.emoji}
						className="h-20 w-16 opacity-60"
					/>
					<Archive
						className="absolute -right-1 -bottom-1 size-6 rounded-full bg-surface p-1 text-ink-soft"
						aria-hidden="true"
					/>
				</span>
			}
		>
			<Title>{action.goalName}</Title>
			<Note>
				{t(
					"{saved} of {target} saved. It leaves your plan; its history stays.",
					{
						saved: money(action.savedMinor),
						target: money(action.targetMinor),
					},
				)}
			</Note>
		</Row>
	);
}

const methodName = (m: string) => METHODS.find((x) => x.id === m)?.title ?? m;

function PlanBody({ action }: { action: ActionOf<"plan"> }) {
	const { before: b, input: n } = action;
	const money = (m: number | null) =>
		m === null ? t("Not set") : formatMinor(m, action.currency);
	return (
		<Row
			visual={
				<IconTile>
					<Wallet className="size-7" aria-hidden="true" />
				</IconTile>
			}
		>
			<Title>{t("Your plan")}</Title>
			{b.incomeMinor !== n.monthlyIncomeMinor && (
				<>
					<Note>{t("Take-home pay each month")}</Note>
					<Change
						from={money(b.incomeMinor)}
						to={money(n.monthlyIncomeMinor)}
					/>
				</>
			)}
			{b.method !== n.budgetMethod && (
				<>
					<Note>{t("Budget style")}</Note>
					<Change
						from={t(methodName(b.method))}
						to={t(methodName(n.budgetMethod))}
					/>
				</>
			)}
			<Note>{t("Safe to spend is worked out again from these.")}</Note>
		</Row>
	);
}

/** Changing things that exist: expenses, subscriptions, goals, the plan. */
export const changeSpecs: Pick<
	SpecMap,
	| "expense-edit"
	| "expense-delete"
	| "subscription-paid"
	| "subscription-edit"
	| "subscription-cancel"
	| "goal-edit"
	| "goal-archive"
	| "plan"
> = {
	"expense-edit": {
		title: () => t("Fix an expense"),
		confirm: () => t("Save change"),
		done: () => t("Expense updated."),
		Body: ExpenseEditBody,
		run: async (a) => {
			await moneyApi.updateTransaction(a.transactionId, a.patch);
			return undefined;
		},
		undo: async (a) => {
			await moneyApi.updateTransaction(a.transactionId, a.undo);
		},
		link: () => activity,
	},
	"expense-delete": {
		title: () => t("Delete an expense"),
		confirm: () => t("Delete it"),
		done: () => t("Expense deleted."),
		Body: ExpenseDeleteBody,
		run: async (a) => {
			await moneyApi.deleteTransaction(a.transactionId);
			return undefined;
		},
		undo: async (a) => {
			await moneyApi.restoreTransaction(a.transactionId);
		},
		link: () => activity,
		careful: true,
	},
	"subscription-paid": {
		title: () => t("Mark as paid"),
		confirm: (a) =>
			t("Mark paid, {amount}", {
				amount: formatMinor(a.amountMinor, a.currency),
			}),
		done: (a) => t("{name} marked paid and logged.", { name: a.name }),
		Body: SubscriptionPaidBody,
		run: async (a) => {
			await subscriptionsApi.markPaid(a.subscriptionId, a.amountMinor);
			return undefined;
		},
		link: () => subscriptions,
	},
	"subscription-edit": {
		title: () => t("Change a subscription"),
		confirm: () => t("Save change"),
		done: (a) => t("{name} updated.", { name: a.input.name }),
		Body: SubscriptionEditBody,
		run: async (a) => {
			await subscriptionsApi.update(a.subscriptionId, a.input);
			return undefined;
		},
		undo: async (a) => {
			await subscriptionsApi.update(a.subscriptionId, {
				...a.input,
				name: a.before.name,
				amountMinor: a.before.amountMinor,
				cycle: a.before.cycle,
				nextDue: a.before.nextDue,
			});
		},
		link: () => subscriptions,
	},
	"subscription-cancel": {
		title: () => t("Cancel a subscription"),
		confirm: () => t("Cancel it"),
		done: (a) => t("{name} cancelled.", { name: a.name }),
		Body: SubscriptionCancelBody,
		run: async (a) => {
			await subscriptionsApi.cancel(a.subscriptionId);
			return undefined;
		},
		undo: async (a) => {
			await subscriptionsApi.restore(a.subscriptionId);
		},
		link: () => subscriptions,
		careful: true,
	},
	"goal-edit": {
		title: () => t("Change a goal"),
		confirm: () => t("Save change"),
		done: (a) => t("{name} updated.", { name: a.input.name }),
		Body: GoalEditBody,
		run: async (a) => {
			await moneyApi.updateGoal(a.goalId, a.input);
			return undefined;
		},
		undo: async (a) => {
			await moneyApi.updateGoal(a.goalId, {
				name: a.before.name,
				emoji: a.before.emoji,
				targetMinor: a.before.targetMinor,
				targetDate: a.before.targetDate,
			});
		},
		link: () => plan,
	},
	"goal-archive": {
		title: () => t("Archive a goal"),
		confirm: () => t("Archive it"),
		done: (a) => t("{name} archived.", { name: a.goalName }),
		Body: GoalArchiveBody,
		run: async (a) => {
			await moneyApi.archiveGoal(a.goalId);
			return undefined;
		},
		link: () => plan,
		careful: true,
	},
	plan: {
		title: () => t("Change your plan"),
		confirm: () => t("Save change"),
		done: () => t("Plan updated. Safe to spend is fresh."),
		Body: PlanBody,
		run: async (a) => {
			await saveProfile(a.input);
			return undefined;
		},
		undo: async (a) => {
			await saveProfile({
				...a.input,
				monthlyIncomeMinor: a.before.incomeMinor,
				budgetMethod: a.before.method as BudgetMethod,
			});
		},
		link: () => plan,
	},
};
