import {
	type Db,
	goal,
	goalDeposit,
	goalMember,
	profile,
	user,
} from "@spendid/db";
import {
	FAMILY_EVENT,
	type FamilyEvent,
	formatMinor,
	JarDepositSchema,
	JarMembersSchema,
	type SharedJar,
} from "@spendid/shared";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { badRequest, notFound } from "../../http/app-error";
import type { Nudge } from "../../notify/notifier";
import type { FamilyRepository } from "./family.repository";
import type { Publish } from "./family.service";

export interface JarsOverview {
	jars: SharedJar[];
	/** My goals nobody else saves into yet. */
	myGoals: { id: string; name: string; emoji: string }[];
}

/** Shared goal jars: the owner invites people from their circle to save together. */
export function createJarsService(deps: {
	db: Db;
	repo: FamilyRepository;
	publish: Publish;
	/** The bell and the phone (never email). */
	nudge?: Nudge;
	/** After a deposit (goal-reached email to the owner). Never awaited. */
	onDeposit?: (userId: string, goalId: string) => Promise<unknown>;
}) {
	const { db, repo } = deps;

	const tell = (userIds: string[], message: string) =>
		Promise.all(
			userIds.map((id) =>
				deps
					.publish(id, {
						type: FAMILY_EVENT,
						what: "jar",
						message,
					} satisfies FamilyEvent)
					.catch(() => undefined),
			),
		);

	async function liveGoal(id: string) {
		const [row] = await db
			.select({ goal, currency: profile.homeCurrency, ownerName: user.name })
			.from(goal)
			.innerJoin(user, eq(user.id, goal.userId))
			.leftJoin(profile, eq(profile.userId, goal.userId))
			.where(and(eq(goal.id, id), isNull(goal.archivedAt)))
			.limit(1);
		return row ?? null;
	}

	async function memberIds(goalId: string): Promise<string[]> {
		const rows = await db
			.select({ userId: goalMember.userId })
			.from(goalMember)
			.where(eq(goalMember.goalId, goalId));
		return rows.map((r) => r.userId);
	}

	return {
		async overview(userId: string): Promise<JarsOverview> {
			const memberOf = db
				.select({ id: goalMember.goalId })
				.from(goalMember)
				.where(eq(goalMember.userId, userId));
			const goals = await db
				.select({ goal, currency: profile.homeCurrency, ownerName: user.name })
				.from(goal)
				.innerJoin(user, eq(user.id, goal.userId))
				.leftJoin(profile, eq(profile.userId, goal.userId))
				.where(
					and(
						isNull(goal.archivedAt),
						or(eq(goal.userId, userId), inArray(goal.id, memberOf)),
					),
				)
				.orderBy(goal.createdAt);
			const ids = goals.map((g) => g.goal.id);
			const [members, given] = ids.length
				? await Promise.all([
						db
							.select({
								goalId: goalMember.goalId,
								userId: goalMember.userId,
								name: user.name,
							})
							.from(goalMember)
							.innerJoin(user, eq(user.id, goalMember.userId))
							.where(inArray(goalMember.goalId, ids)),
						db
							.select({
								goalId: goalDeposit.goalId,
								userId: goalDeposit.userId,
								sum: sql<number>`sum(${goalDeposit.amountMinor})::bigint`,
							})
							.from(goalDeposit)
							.where(inArray(goalDeposit.goalId, ids))
							.groupBy(goalDeposit.goalId, goalDeposit.userId),
					])
				: [[], []];
			const givenBy = (goalId: string, uid: string) =>
				Number(
					given.find((g) => g.goalId === goalId && g.userId === uid)?.sum ?? 0,
				);

			const jars: SharedJar[] = [];
			const myGoals: JarsOverview["myGoals"] = [];
			for (const { goal: g, currency, ownerName } of goals) {
				const people = members.filter((m) => m.goalId === g.id);
				if (people.length === 0) {
					if (g.userId === userId)
						myGoals.push({ id: g.id, name: g.name, emoji: g.emoji });
					continue;
				}
				jars.push({
					id: g.id,
					name: g.name,
					emoji: g.emoji,
					targetMinor: g.targetMinor,
					savedMinor: g.savedMinor,
					currency: currency ?? "MYR",
					ownerId: g.userId,
					ownerName,
					mine: g.userId === userId,
					members: [
						{
							userId: g.userId,
							name: ownerName,
							// Whatever members didn't put in is the owner's, including savings from before sharing.
							givenMinor: Math.max(
								0,
								g.savedMinor -
									people.reduce((a, p) => a + givenBy(g.id, p.userId), 0),
							),
						},
						...people.map((p) => ({
							userId: p.userId,
							name: p.name,
							givenMinor: givenBy(g.id, p.userId),
						})),
					],
				});
			}
			return { jars, myGoals };
		},

		/** The owner chooses who saves with them. Everyone must be in their circle. */
		async setMembers(
			userId: string,
			goalId: string,
			raw: unknown,
		): Promise<void> {
			const { userIds } = JarMembersSchema.parse(raw);
			const found = await liveGoal(goalId);
			if (!found || found.goal.userId !== userId) throw notFound("Goal");
			const wanted = [...new Set(userIds)].filter((id) => id !== userId);
			for (const id of wanted)
				if (!(await repo.isConnected(userId, id)))
					throw badRequest("You can only add people in your circle.");
			const before = await memberIds(goalId);
			await db.transaction(async (tx) => {
				await tx.delete(goalMember).where(eq(goalMember.goalId, goalId));
				if (wanted.length)
					await tx
						.insert(goalMember)
						.values(wanted.map((id) => ({ goalId, userId: id })));
			});
			const added = wanted.filter((id) => !before.includes(id));
			await tell(
				added,
				`${found.ownerName} invited you to save for ${found.goal.emoji} ${found.goal.name}.`,
			);
		},

		async leave(userId: string, goalId: string): Promise<void> {
			const rows = await db
				.delete(goalMember)
				.where(
					and(eq(goalMember.goalId, goalId), eq(goalMember.userId, userId)),
				)
				.returning({ goalId: goalMember.goalId });
			if (rows.length === 0) throw notFound("Shared jar");
		},

		/** Members add money; only the owner can take money out. */
		async deposit(userId: string, goalId: string, raw: unknown): Promise<void> {
			const { amountMinor } = JarDepositSchema.parse(raw);
			const found = await liveGoal(goalId);
			if (!found) throw notFound("Shared jar");
			const members = await memberIds(goalId);
			const isOwner = found.goal.userId === userId;
			if (!isOwner && !members.includes(userId)) throw notFound("Shared jar");
			if (!isOwner && amountMinor < 0)
				throw badRequest("Only the jar's owner can take money out.");

			const saved = await db.transaction(async (tx) => {
				// Checked in the update itself, so who-gave-what always adds up to the balance.
				const [row] = await tx
					.update(goal)
					.set({ savedMinor: sql`${goal.savedMinor} + ${amountMinor}` })
					.where(
						and(
							eq(goal.id, goalId),
							sql`${goal.savedMinor} + ${amountMinor} >= 0`,
						),
					)
					.returning({ savedMinor: goal.savedMinor });
				if (!row)
					throw badRequest("You can't take out more than the jar holds.");
				await tx.insert(goalDeposit).values({ goalId, userId, amountMinor });
				return row.savedMinor;
			});

			const me = await repo.contact(userId);
			const jar = `${found.goal.emoji} ${found.goal.name}`;
			const amount = formatMinor(
				Math.abs(amountMinor),
				found.currency ?? "MYR",
			);
			const reached =
				saved >= found.goal.targetMinor &&
				saved - amountMinor < found.goal.targetMinor;
			const message = reached
				? `${jar} is full! 🎉`
				: amountMinor > 0
					? `${me?.name ?? "Someone"} added ${amount} to ${jar}.`
					: `${me?.name ?? "Someone"} took ${amount} out of ${jar}.`;
			const others = [found.goal.userId, ...members].filter(
				(id) => id !== userId,
			);
			await tell(others, message);
			const who = me?.name ?? "Someone";
			const currency = found.currency ?? "MYR";
			for (const id of others)
				await deps
					.nudge?.(id, {
						kind: "family-jar",
						group: "family",
						build: ({ money, appUrl }) => ({
							title: reached
								? `${jar} is full! 🎉`
								: amountMinor > 0
									? `${who} added ${money(Math.abs(amountMinor), currency)} to ${jar}`
									: `${who} took ${money(Math.abs(amountMinor), currency)} out of ${jar}`,
							body: reached
								? "You reached it together."
								: "See the jar in Family.",
							url: `${appUrl}/app/family`,
						}),
					})
					.catch(() => undefined);
			deps.onDeposit?.(userId, goalId).catch(() => undefined);
		},
	};
}

export type JarsService = ReturnType<typeof createJarsService>;
