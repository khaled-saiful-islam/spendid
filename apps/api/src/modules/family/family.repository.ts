import {
	connection,
	type Db,
	familyInvite,
	goal,
	goalMember,
	shareGrant,
	user,
} from "@spendid/db";
import {
	type FamilyPerson,
	inverseRelation,
	type PendingInvite,
	type Relation,
	type ShareLevel,
	type ShareState,
} from "@spendid/shared";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

const activePair = (a: string, b: string) =>
	and(
		isNull(connection.endedAt),
		or(
			and(eq(connection.requesterId, a), eq(connection.addresseeId, b)),
			and(eq(connection.requesterId, b), eq(connection.addresseeId, a)),
		),
	);

const mine = (userId: string) =>
	and(
		isNull(connection.endedAt),
		or(eq(connection.requesterId, userId), eq(connection.addresseeId, userId)),
	);

function shareState(row: {
	level: ShareLevel;
	pausedAt: Date | null;
	updatedAt: Date;
}): ShareState {
	return {
		level: row.level,
		paused: row.pausedAt !== null,
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function inviteDto(
	row: typeof familyInvite.$inferSelect,
): PendingInvite {
	return {
		id: row.id,
		relation: row.relation,
		level: row.level,
		email: row.email,
		expiresAt: row.expiresAt.toISOString(),
		createdAt: row.createdAt.toISOString(),
	};
}

/** Connections, share grants and invites. Every query is scoped to the people involved. */
export function createFamilyRepository(db: Db) {
	return {
		async people(userId: string): Promise<FamilyPerson[]> {
			const rows = await db
				.select()
				.from(connection)
				.where(mine(userId))
				.orderBy(connection.createdAt);
			if (rows.length === 0) return [];
			const others = rows.map((r) =>
				r.requesterId === userId ? r.addresseeId : r.requesterId,
			);
			const [names, grants] = await Promise.all([
				db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(inArray(user.id, others)),
				db
					.select()
					.from(shareGrant)
					.where(
						or(
							and(
								eq(shareGrant.ownerId, userId),
								inArray(shareGrant.viewerId, others),
							),
							and(
								eq(shareGrant.viewerId, userId),
								inArray(shareGrant.ownerId, others),
							),
						),
					),
			]);
			const nameOf = new Map(names.map((n) => [n.id, n.name]));
			return rows.map((r) => {
				const other = r.requesterId === userId ? r.addresseeId : r.requesterId;
				const theirs = grants.find(
					(g) => g.ownerId === other && g.viewerId === userId,
				);
				const ours = grants.find(
					(g) => g.ownerId === userId && g.viewerId === other,
				);
				return {
					userId: other,
					name: nameOf.get(other) ?? "Someone",
					relation:
						r.requesterId === userId ? r.relation : inverseRelation(r.relation),
					since: r.createdAt.toISOString(),
					theyShare: theirs ? shareState(theirs) : null,
					iShare: ours ? shareState(ours) : null,
				};
			});
		},

		async isConnected(a: string, b: string, conn: Conn = db): Promise<boolean> {
			const [row] = await conn
				.select({ id: connection.id })
				.from(connection)
				.where(activePair(a, b))
				.limit(1);
			return Boolean(row);
		},

		async circleSize(userId: string, conn: Conn = db): Promise<number> {
			const [row] = await conn
				.select({ n: sql<number>`count(*)::int` })
				.from(connection)
				.where(mine(userId));
			return row?.n ?? 0;
		},

		/** The live grant from owner to viewer, or null when nothing is shared. */
		async grant(ownerId: string, viewerId: string): Promise<ShareState | null> {
			const [row] = await db
				.select()
				.from(shareGrant)
				.where(
					and(
						eq(shareGrant.ownerId, ownerId),
						eq(shareGrant.viewerId, viewerId),
					),
				)
				.limit(1);
			return row ? shareState(row) : null;
		},

		async setGrant(
			ownerId: string,
			viewerId: string,
			level: ShareLevel,
			paused: boolean,
			conn: Conn = db,
		): Promise<void> {
			const pausedAt = paused ? new Date() : null;
			await conn
				.insert(shareGrant)
				.values({ ownerId, viewerId, level, pausedAt })
				.onConflictDoUpdate({
					target: [shareGrant.ownerId, shareGrant.viewerId],
					set: {
						level,
						pausedAt: paused
							? sql`coalesce(${shareGrant.pausedAt}, now())`
							: null,
						updatedAt: new Date(),
					},
				});
		},

		/** People who can currently see `ownerId`'s expenses one by one. */
		async expenseViewers(ownerId: string): Promise<string[]> {
			const rows = await db
				.select({ viewerId: shareGrant.viewerId })
				.from(shareGrant)
				.where(
					and(
						eq(shareGrant.ownerId, ownerId),
						isNull(shareGrant.pausedAt),
						inArray(shareGrant.level, ["transactions", "receipts"]),
					),
				);
			return rows.map((r) => r.viewerId);
		},

		async connect(
			tx: Tx,
			requesterId: string,
			addresseeId: string,
			relation: Relation,
		): Promise<void> {
			await tx
				.insert(connection)
				.values({ requesterId, addresseeId, relation });
		},

		/** Ends the connection, removes both grants and each other's jar memberships. */
		async disconnect(a: string, b: string): Promise<boolean> {
			return db.transaction(async (tx) => {
				const ended = await tx
					.update(connection)
					.set({ endedAt: new Date() })
					.where(activePair(a, b))
					.returning({ id: connection.id });
				if (ended.length === 0) return false;
				await tx
					.delete(shareGrant)
					.where(
						or(
							and(eq(shareGrant.ownerId, a), eq(shareGrant.viewerId, b)),
							and(eq(shareGrant.ownerId, b), eq(shareGrant.viewerId, a)),
						),
					);
				for (const [owner, member] of [
					[a, b],
					[b, a],
				] as const) {
					await tx
						.delete(goalMember)
						.where(
							and(
								eq(goalMember.userId, member),
								inArray(
									goalMember.goalId,
									tx
										.select({ id: goal.id })
										.from(goal)
										.where(eq(goal.userId, owner)),
								),
							),
						);
				}
				return true;
			});
		},

		async pendingInvites(userId: string): Promise<PendingInvite[]> {
			const rows = await db
				.select()
				.from(familyInvite)
				.where(
					and(
						eq(familyInvite.inviterId, userId),
						isNull(familyInvite.acceptedAt),
						isNull(familyInvite.revokedAt),
						gt(familyInvite.expiresAt, new Date()),
					),
				)
				.orderBy(desc(familyInvite.createdAt));
			return rows.map(inviteDto);
		},

		async invitesSince(userId: string, since: Date): Promise<number> {
			const [row] = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(familyInvite)
				.where(
					and(
						eq(familyInvite.inviterId, userId),
						gt(familyInvite.createdAt, since),
					),
				);
			return row?.n ?? 0;
		},

		async createInvite(
			values: typeof familyInvite.$inferInsert,
		): Promise<PendingInvite> {
			const [row] = await db.insert(familyInvite).values(values).returning();
			if (!row) throw new Error("invite insert returned nothing");
			return inviteDto(row);
		},

		async inviteByHash(tokenHash: string, conn: Conn = db) {
			const [row] = await conn
				.select({
					invite: familyInvite,
					inviterName: user.name,
					banned: user.banned,
				})
				.from(familyInvite)
				.innerJoin(user, eq(user.id, familyInvite.inviterId))
				.where(eq(familyInvite.tokenHash, tokenHash))
				.limit(1);
			return row ?? null;
		},

		async lockInvite(tx: Tx, id: string) {
			const [row] = await tx
				.select()
				.from(familyInvite)
				.where(eq(familyInvite.id, id))
				.for("update");
			return row ?? null;
		},

		async markAccepted(tx: Tx, id: string, acceptedBy: string): Promise<void> {
			await tx
				.update(familyInvite)
				.set({ acceptedAt: new Date(), acceptedBy })
				.where(eq(familyInvite.id, id));
		},

		async revokeInvite(userId: string, id: string): Promise<boolean> {
			const rows = await db
				.update(familyInvite)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(familyInvite.id, id),
						eq(familyInvite.inviterId, userId),
						isNull(familyInvite.acceptedAt),
						isNull(familyInvite.revokedAt),
					),
				)
				.returning({ id: familyInvite.id });
			return rows.length > 0;
		},

		async contact(userId: string, conn: Conn = db) {
			const [row] = await conn
				.select({
					id: user.id,
					name: user.name,
					email: user.email,
					role: user.role,
				})
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);
			return row ?? null;
		},
	};
}

export type FamilyRepository = ReturnType<typeof createFamilyRepository>;
export type { Tx };
