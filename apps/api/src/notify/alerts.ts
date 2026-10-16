import {
	budget,
	category,
	type Db,
	goal,
	profile,
	transaction,
} from "@spendid/db";
import { and, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { monthBounds } from "../modules/money/summary.service";
import type { Notifier } from "./notifier";

const UNUSUAL_TIMES = 3;
const UNUSUAL_MIN_HISTORY = 5;
const DUPLICATE_WINDOW_MS = 24 * 3_600_000;

function median(values: number[]): number {
	const s = [...values].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/**
 * Alerts that follow a single action: a new expense (budget 80% / 100%, unusual size,
 * charged twice) or a deposit that fills a goal. Each one is sent at most once.
 */
export function createMoneyAlerts(deps: { db: Db; notifier: Notifier }) {
	const { db, notifier } = deps;

	async function budgetAlert(
		userId: string,
		categoryId: string,
		timeZone: string,
	): Promise<void> {
		const [limit] = await db
			.select({ minor: budget.monthlyLimitMinor, name: category.name })
			.from(budget)
			.innerJoin(category, eq(category.id, budget.categoryId))
			.where(and(eq(budget.userId, userId), eq(budget.categoryId, categoryId)))
			.limit(1);
		if (!limit || limit.minor <= 0) return;
		const bounds = await monthBounds(db, timeZone);
		const localDay = sql`(${transaction.occurredAt} at time zone ${timeZone})::date`;
		const [{ spent } = { spent: "0" }] = await db
			.select({
				spent: sql<string>`coalesce(sum(${transaction.homeAmountMinor}), 0)`,
			})
			.from(transaction)
			.where(
				and(
					eq(transaction.userId, userId),
					eq(transaction.categoryId, categoryId),
					isNull(transaction.deletedAt),
					sql`${localDay} >= ${bounds.monthStart}::date`,
					sql`${localDay} < ${bounds.nextMonth}::date`,
				),
			);
		const used = Number(spent) / limit.minor;
		const step = used >= 1 ? 100 : used >= 0.8 ? 80 : 0;
		if (!step) return;
		const [p] = await db
			.select({ cur: profile.homeCurrency })
			.from(profile)
			.where(eq(profile.userId, userId))
			.limit(1);
		const cur = p?.cur ?? "MYR";
		const month = bounds.today.slice(0, 7);
		await notifier.notify(userId, {
			kind: "budget-alert",
			group: "budget",
			dedupeKey: `${categoryId}:${month}:${step}`,
			build: ({ money, appUrl }) => ({
				subject:
					step === 100
						? `${limit.name}: budget used up`
						: `${limit.name}: 80% of your budget used`,
				preview: `${money(Number(spent), cur)} of ${money(limit.minor, cur)} with ${bounds.daysLeft} days to go.`,
				heading:
					step === 100
						? `${limit.name} is at its limit`
						: `${limit.name} is at 80%`,
				body:
					step === 100
						? `You've spent your whole ${limit.name.toLowerCase()} budget for this month. Anything more comes out of the rest of your month.`
						: `You've used 80% of this month's ${limit.name.toLowerCase()} budget. A little care for the next ${bounds.daysLeft} days keeps you on plan.`,
				rows: [
					{ label: "Spent", value: money(Number(spent), cur) },
					{ label: "Monthly limit", value: money(limit.minor, cur) },
					{ label: "Days left", value: String(bounds.daysLeft) },
				],
				action: "See my plan",
				url: `${appUrl}/app/plan`,
			}),
		});
	}

	async function unusual(
		userId: string,
		tx: typeof transaction.$inferSelect,
		cur: string,
	): Promise<void> {
		const history = await db
			.select({ minor: transaction.homeAmountMinor })
			.from(transaction)
			.where(
				and(
					eq(transaction.userId, userId),
					eq(transaction.categoryId, tx.categoryId),
					isNull(transaction.deletedAt),
					ne(transaction.id, tx.id),
					gte(transaction.occurredAt, sql`now() - interval '120 days'`),
				),
			)
			.orderBy(desc(transaction.occurredAt))
			.limit(60);
		if (history.length < UNUSUAL_MIN_HISTORY) return;
		const typical = median(history.map((h) => h.minor));
		if (typical <= 0 || tx.homeAmountMinor < typical * UNUSUAL_TIMES) return;
		const [cat] = await db
			.select({ name: category.name })
			.from(category)
			.where(eq(category.id, tx.categoryId))
			.limit(1);
		const what = tx.merchant ?? cat?.name ?? "an expense";
		await notifier.notify(userId, {
			kind: "unusual-charge",
			group: "unusual",
			dedupeKey: tx.id,
			build: ({ money, appUrl }) => ({
				subject: `Bigger than usual: ${what}`,
				preview: `${money(tx.homeAmountMinor, cur)}, about ${Math.round(tx.homeAmountMinor / typical)}× your usual.`,
				heading: "That one's bigger than usual",
				body: `${what} came to ${money(tx.homeAmountMinor, cur)}. Your ${(cat?.name ?? "spending").toLowerCase()} is usually around ${money(Math.round(typical), cur)}. If it's right, no action needed.`,
				action: "Check it",
				url: `${appUrl}/app/activity`,
			}),
		});
	}

	async function duplicate(
		userId: string,
		tx: typeof transaction.$inferSelect,
		cur: string,
	): Promise<void> {
		if (!tx.merchant) return;
		const at = tx.occurredAt.getTime();
		const [twin] = await db
			.select({ id: transaction.id })
			.from(transaction)
			.where(
				and(
					eq(transaction.userId, userId),
					ne(transaction.id, tx.id),
					isNull(transaction.deletedAt),
					eq(transaction.merchant, tx.merchant),
					eq(transaction.homeAmountMinor, tx.homeAmountMinor),
					gte(transaction.occurredAt, new Date(at - DUPLICATE_WINDOW_MS)),
					lt(transaction.occurredAt, new Date(at + DUPLICATE_WINDOW_MS)),
				),
			)
			.limit(1);
		if (!twin) return;
		const pair = [twin.id, tx.id].sort().join(":");
		await notifier.notify(userId, {
			kind: "duplicate-charge",
			group: "unusual",
			dedupeKey: pair,
			build: ({ money, appUrl }) => ({
				subject: `Logged twice? ${tx.merchant}`,
				preview: `Two charges of ${money(tx.homeAmountMinor, cur)} at ${tx.merchant} within a day.`,
				heading: "Same charge twice?",
				body: `You have two expenses of ${money(tx.homeAmountMinor, cur)} at ${tx.merchant} within a day. If one is a mistake, delete it so your numbers stay right.`,
				action: "Review expenses",
				url: `${appUrl}/app/activity`,
			}),
		});
	}

	return {
		/** Runs after an expense is saved. Never throws to the caller. */
		async afterExpense(userId: string, transactionId: string): Promise<void> {
			const [tx] = await db
				.select()
				.from(transaction)
				.where(eq(transaction.id, transactionId))
				.limit(1);
			if (!tx || tx.userId !== userId || tx.deletedAt) return;
			const [p] = await db
				.select({ timeZone: profile.timeZone, cur: profile.homeCurrency })
				.from(profile)
				.where(eq(profile.userId, userId))
				.limit(1);
			const timeZone = p?.timeZone ?? "UTC";
			const cur = p?.cur ?? tx.homeCurrency;
			await Promise.allSettled([
				budgetAlert(userId, tx.categoryId, timeZone),
				unusual(userId, tx, cur),
				duplicate(userId, tx, cur),
			]);
		},

		/** After money goes into a goal: a note when it's full. */
		async afterDeposit(_userId: string, goalId: string): Promise<void> {
			const [g] = await db
				.select()
				.from(goal)
				.where(eq(goal.id, goalId))
				.limit(1);
			if (!g || g.savedMinor < g.targetMinor) return;
			const [p] = await db
				.select({ cur: profile.homeCurrency })
				.from(profile)
				.where(eq(profile.userId, g.userId))
				.limit(1);
			await notifier.notify(g.userId, {
				kind: "goal-reached",
				group: "goals",
				dedupeKey: g.id,
				build: ({ money, appUrl }) => ({
					subject: `${g.emoji} ${g.name} is fully saved!`,
					preview: `You reached ${money(g.targetMinor, p?.cur ?? "MYR")}. Time to enjoy it.`,
					heading: `You did it: ${g.name}`,
					body: `Your ${g.name} jar is full. Every deposit added up. Enjoy it, or set your next goal.`,
					rows: [
						{ label: "Saved", value: money(g.savedMinor, p?.cur ?? "MYR") },
					],
					action: "See my goals",
					url: `${appUrl}/app/plan`,
				}),
			});
		},
	};
}

export type MoneyAlerts = ReturnType<typeof createMoneyAlerts>;
