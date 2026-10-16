import { budget, type Db, goal } from "@spendid/db";
import {
	type BudgetInput,
	type Goal,
	type GoalInput,
	GoalInputSchema,
	goalMonthlyNeeded,
} from "@spendid/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { notFound } from "../../http/app-error";

type GoalRow = typeof goal.$inferSelect;

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

function goalDto(g: GoalRow): Goal {
	return {
		id: g.id,
		name: g.name,
		emoji: g.emoji,
		targetMinor: g.targetMinor,
		savedMinor: g.savedMinor,
		targetDate: g.targetDate,
		monthlyNeededMinor: goalMonthlyNeeded(g, todayIso()),
	};
}

/** Budgets (monthly limit per category) and savings goals. All scoped by user id. */
export function createPlanRepository(db: Db) {
	const ownedGoal = (userId: string, id: string) =>
		and(eq(goal.userId, userId), eq(goal.id, id), isNull(goal.archivedAt));

	return {
		async budgets(
			userId: string,
		): Promise<{ categoryId: string; monthlyLimitMinor: number }[]> {
			return db
				.select({
					categoryId: budget.categoryId,
					monthlyLimitMinor: budget.monthlyLimitMinor,
				})
				.from(budget)
				.where(eq(budget.userId, userId));
		},

		/** Sets or clears (null) one category's monthly limit. */
		async setBudget(userId: string, input: BudgetInput): Promise<void> {
			if (input.monthlyLimitMinor === null) {
				await db
					.delete(budget)
					.where(
						and(
							eq(budget.userId, userId),
							eq(budget.categoryId, input.categoryId),
						),
					);
				return;
			}
			await db
				.insert(budget)
				.values({
					userId,
					categoryId: input.categoryId,
					monthlyLimitMinor: input.monthlyLimitMinor,
				})
				.onConflictDoUpdate({
					target: [budget.userId, budget.categoryId],
					set: { monthlyLimitMinor: input.monthlyLimitMinor },
				});
		},

		async goals(userId: string): Promise<Goal[]> {
			const rows = await db
				.select()
				.from(goal)
				.where(and(eq(goal.userId, userId), isNull(goal.archivedAt)))
				.orderBy(asc(goal.createdAt));
			return rows.map(goalDto);
		},

		async createGoal(userId: string, raw: GoalInput): Promise<Goal> {
			const input = GoalInputSchema.parse(raw);
			const [row] = await db
				.insert(goal)
				.values({ userId, ...input, targetDate: input.targetDate ?? null })
				.returning();
			if (!row) throw new Error("goal insert returned nothing");
			return goalDto(row);
		},

		async updateGoal(
			userId: string,
			id: string,
			raw: GoalInput,
		): Promise<Goal> {
			const input = GoalInputSchema.parse(raw);
			const [row] = await db
				.update(goal)
				.set({ ...input, targetDate: input.targetDate ?? null })
				.where(ownedGoal(userId, id))
				.returning();
			if (!row) throw notFound("Goal");
			return goalDto(row);
		},

		/** Adds (or with a negative amount, takes out) money; never below zero. */
		async deposit(
			userId: string,
			id: string,
			amountMinor: number,
		): Promise<Goal> {
			const [row] = await db
				.update(goal)
				.set({
					savedMinor: sql`greatest(0, ${goal.savedMinor} + ${amountMinor})`,
				})
				.where(ownedGoal(userId, id))
				.returning();
			if (!row) throw notFound("Goal");
			return goalDto(row);
		},

		async archiveGoal(userId: string, id: string): Promise<void> {
			const [row] = await db
				.update(goal)
				.set({ archivedAt: new Date() })
				.where(ownedGoal(userId, id))
				.returning();
			if (!row) throw notFound("Goal");
		},
	};
}

export type PlanRepository = ReturnType<typeof createPlanRepository>;
