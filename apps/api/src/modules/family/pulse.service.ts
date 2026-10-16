import {
	category,
	connection,
	type Db,
	goal,
	goalDeposit,
	goalMember,
	reaction,
	shareGrant,
	transaction,
	user,
} from "@spendid/db";
import {
	FAMILY_EVENT,
	type FamilyEvent,
	type PulseItem,
	type PulseReaction,
	type ReactionInput,
	ReactionInputSchema,
} from "@spendid/shared";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { badRequest, notFound } from "../../http/app-error";
import type { FamilyRepository } from "./family.repository";
import type { Publish } from "./family.service";

const WINDOW_DAYS = 14;
const LIMIT = 40;

type Draft = Omit<PulseItem, "reactions">;

/**
 * The family pulse: recent expenses people chose to show, shared-jar deposits and new
 * connections. Built on read, so pausing or deleting hides an item at once.
 */
export function createPulseService(deps: {
	db: Db;
	repo: FamilyRepository;
	publish: Publish;
}) {
	const { db, repo } = deps;
	const since = () => new Date(Date.now() - WINDOW_DAYS * 86_400_000);

	/** Owners whose expenses `viewerId` may see one by one (plus themselves when someone sees theirs). */
	async function expenseOwners(viewerId: string): Promise<string[]> {
		const rows = await db
			.select({ ownerId: shareGrant.ownerId })
			.from(shareGrant)
			.where(
				and(
					eq(shareGrant.viewerId, viewerId),
					isNull(shareGrant.pausedAt),
					inArray(shareGrant.level, ["transactions", "receipts"]),
				),
			);
		const owners = rows.map((r) => r.ownerId);
		if ((await repo.expenseViewers(viewerId)).length > 0) owners.push(viewerId);
		return owners;
	}

	/** Shared jars I own (with members) or belong to. */
	async function jarIds(userId: string): Promise<string[]> {
		const rows = await db
			.selectDistinct({ id: goal.id })
			.from(goal)
			.innerJoin(goalMember, eq(goalMember.goalId, goal.id))
			.where(
				and(
					isNull(goal.archivedAt),
					or(eq(goal.userId, userId), eq(goalMember.userId, userId)),
				),
			);
		return rows.map((r) => r.id);
	}

	async function expenses(userId: string): Promise<Draft[]> {
		const owners = await expenseOwners(userId);
		if (owners.length === 0) return [];
		const rows = await db
			.select({
				id: transaction.id,
				at: transaction.occurredAt,
				actorId: transaction.userId,
				actorName: user.name,
				merchant: transaction.merchant,
				category: category.name,
				icon: category.icon,
				tint: category.tint,
				amountMinor: transaction.homeAmountMinor,
				currency: transaction.homeCurrency,
			})
			.from(transaction)
			.innerJoin(category, eq(category.id, transaction.categoryId))
			.innerJoin(user, eq(user.id, transaction.userId))
			.where(
				and(
					inArray(transaction.userId, owners),
					isNull(transaction.deletedAt),
					gt(transaction.occurredAt, since()),
				),
			)
			.orderBy(desc(transaction.occurredAt))
			.limit(LIMIT);
		return rows.map((r) => ({
			kind: "expense",
			id: r.id,
			at: r.at.toISOString(),
			actorId: r.actorId,
			actorName: r.actorName,
			mine: r.actorId === userId,
			title: r.merchant ?? r.category,
			icon: r.icon,
			tint: r.tint,
			amountMinor: r.amountMinor,
			currency: r.currency,
		}));
	}

	async function deposits(userId: string): Promise<Draft[]> {
		const jars = await jarIds(userId);
		if (jars.length === 0) return [];
		const rows = await db
			.select({
				id: goalDeposit.id,
				at: goalDeposit.createdAt,
				actorId: goalDeposit.userId,
				actorName: user.name,
				jar: goal.name,
				emoji: goal.emoji,
				amountMinor: goalDeposit.amountMinor,
				currency: sql<string>`(select home_currency from profile where user_id = ${goal.userId})`,
			})
			.from(goalDeposit)
			.innerJoin(goal, eq(goal.id, goalDeposit.goalId))
			.innerJoin(user, eq(user.id, goalDeposit.userId))
			.where(
				and(
					inArray(goalDeposit.goalId, jars),
					gt(goalDeposit.createdAt, since()),
				),
			)
			.orderBy(desc(goalDeposit.createdAt))
			.limit(LIMIT);
		return rows.map((r) => ({
			kind: "deposit",
			id: r.id,
			at: r.at.toISOString(),
			actorId: r.actorId,
			actorName: r.actorName,
			mine: r.actorId === userId,
			title: r.jar,
			icon: r.emoji,
			tint: null,
			amountMinor: r.amountMinor,
			currency: r.currency ?? "MYR",
		}));
	}

	async function joins(userId: string): Promise<Draft[]> {
		const rows = await db
			.select({
				id: connection.id,
				at: connection.createdAt,
				requesterId: connection.requesterId,
				addresseeId: connection.addresseeId,
			})
			.from(connection)
			.where(
				and(
					isNull(connection.endedAt),
					or(
						eq(connection.requesterId, userId),
						eq(connection.addresseeId, userId),
					),
					gt(connection.createdAt, since()),
				),
			);
		const people = await repo.people(userId);
		const nameOf = new Map(people.map((p) => [p.userId, p.name]));
		return rows.map((r) => {
			const other = r.requesterId === userId ? r.addresseeId : r.requesterId;
			return {
				kind: "joined",
				id: r.id,
				at: r.at.toISOString(),
				actorId: other,
				actorName: nameOf.get(other) ?? "Someone",
				mine: false,
				title: nameOf.get(other) ?? "Someone",
				icon: "🤝",
				tint: null,
				amountMinor: null,
				currency: null,
			};
		});
	}

	async function reactionsFor(
		userId: string,
		items: Draft[],
	): Promise<Map<string, PulseReaction[]>> {
		const ids = items.filter((i) => i.kind !== "joined").map((i) => i.id);
		const out = new Map<string, PulseReaction[]>();
		if (ids.length === 0) return out;
		const rows = await db
			.select({
				targetId: reaction.targetId,
				emoji: reaction.emoji,
				userId: reaction.userId,
				name: user.name,
			})
			.from(reaction)
			.innerJoin(user, eq(user.id, reaction.userId))
			.where(inArray(reaction.targetId, ids))
			.orderBy(reaction.createdAt);
		// Only name people I'm connected to; others count without a name.
		const known = new Set((await repo.people(userId)).map((p) => p.userId));
		for (const r of rows) {
			const list = out.get(r.targetId) ?? [];
			const entry = list.find((e) => e.emoji === r.emoji) ?? {
				emoji: r.emoji,
				count: 0,
				mine: false,
				names: [],
			};
			if (!list.includes(entry)) list.push(entry);
			entry.count += 1;
			if (r.userId === userId) entry.mine = true;
			if (r.userId === userId) entry.names.push("You");
			else if (known.has(r.userId)) entry.names.push(r.name);
			out.set(r.targetId, list);
		}
		return out;
	}

	async function canSee(
		userId: string,
		input: ReactionInput,
	): Promise<string | null> {
		if (input.kind === "expense") {
			const [row] = await db
				.select({ ownerId: transaction.userId, title: transaction.merchant })
				.from(transaction)
				.where(
					and(
						eq(transaction.id, input.targetId),
						isNull(transaction.deletedAt),
					),
				)
				.limit(1);
			if (!row) return null;
			const owners = await expenseOwners(userId);
			return owners.includes(row.ownerId) ? row.ownerId : null;
		}
		const [row] = await db
			.select({ ownerId: goalDeposit.userId, goalId: goalDeposit.goalId })
			.from(goalDeposit)
			.where(eq(goalDeposit.id, input.targetId))
			.limit(1);
		if (!row) return null;
		return (await jarIds(userId)).includes(row.goalId) ? row.ownerId : null;
	}

	return {
		async feed(userId: string): Promise<PulseItem[]> {
			const parts = await Promise.all([
				expenses(userId),
				deposits(userId),
				joins(userId),
			]);
			const items = parts
				.flat()
				.sort((a, b) => b.at.localeCompare(a.at))
				.slice(0, LIMIT);
			const reactions = await reactionsFor(userId, items);
			return items.map((i) => ({ ...i, reactions: reactions.get(i.id) ?? [] }));
		},

		async react(userId: string, raw: ReactionInput): Promise<void> {
			const input = ReactionInputSchema.parse(raw);
			const ownerId = await canSee(userId, input);
			if (!ownerId) throw notFound("Pulse item");
			if (ownerId === userId)
				throw badRequest("Cheer someone else on. You can't react to your own.");
			if (input.emoji === null) {
				await db
					.delete(reaction)
					.where(
						and(
							eq(reaction.userId, userId),
							eq(reaction.targetKind, input.kind),
							eq(reaction.targetId, input.targetId),
						),
					);
			} else {
				await db
					.insert(reaction)
					.values({
						userId,
						targetKind: input.kind,
						targetId: input.targetId,
						emoji: input.emoji,
					})
					.onConflictDoUpdate({
						target: [reaction.userId, reaction.targetKind, reaction.targetId],
						set: { emoji: input.emoji, createdAt: new Date() },
					});
			}
			const me = await repo.contact(userId);
			const event: FamilyEvent = {
				type: FAMILY_EVENT,
				what: "pulse",
				message: input.emoji
					? `${me?.name ?? "Someone"} reacted ${input.emoji}`
					: undefined,
			};
			await deps.publish(ownerId, event).catch(() => undefined);
		},
	};
}

export type PulseService = ReturnType<typeof createPulseService>;
