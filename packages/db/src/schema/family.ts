import { sql } from "drizzle-orm";
import {
	bigint,
	char,
	index,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { goal } from "./money";

const id = () => uuid().primaryKey().default(sql`uuidv7()`);
const createdAt = () =>
	timestamp({ withTimezone: true }).notNull().defaultNow();

export const familyRelation = pgEnum("family_relation", [
	"spouse",
	"partner",
	"parent",
	"child",
	"sibling",
	"other",
]);

/** Each level includes everything before it. */
export const shareLevel = pgEnum("share_level", [
	"totals",
	"categories",
	"transactions",
	"receipts",
]);

/**
 * A single-use invite link. Only the token's SHA-256 is stored. `relation` is how the
 * inviter describes the invitee; `level` is what the inviter offers to share.
 */
export const familyInvite = pgTable(
	"family_invite",
	{
		id: id(),
		inviterId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		tokenHash: text().notNull().unique(),
		relation: familyRelation().notNull(),
		level: shareLevel().notNull(),
		email: text(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		acceptedAt: timestamp({ withTimezone: true }),
		acceptedBy: text().references(() => user.id, { onDelete: "set null" }),
		revokedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [
		index("family_invite_inviter_idx").on(t.inviterId, t.createdAt),
		index("family_invite_accepted_idx").on(t.acceptedBy),
	],
);

/** Two people who both agreed to be in each other's circle. `relation` is the requester's view. */
export const connection = pgTable(
	"connection",
	{
		id: id(),
		requesterId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		addresseeId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		relation: familyRelation().notNull(),
		createdAt: createdAt(),
		endedAt: timestamp({ withTimezone: true }),
	},
	(t) => [
		uniqueIndex("connection_active_pair_idx")
			.on(
				sql`least(${t.requesterId}, ${t.addresseeId})`,
				sql`greatest(${t.requesterId}, ${t.addresseeId})`,
			)
			.where(sql`${t.endedAt} is null`),
		index("connection_requester_idx").on(t.requesterId),
		index("connection_addressee_idx").on(t.addresseeId),
	],
);

/** What `ownerId` lets `viewerId` see. Paused grants share nothing until resumed. */
export const shareGrant = pgTable(
	"share_grant",
	{
		ownerId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		viewerId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		level: shareLevel().notNull(),
		pausedAt: timestamp({ withTimezone: true }),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		primaryKey({ columns: [t.ownerId, t.viewerId] }),
		index("share_grant_viewer_idx").on(t.viewerId),
	],
);

export const reactionTarget = pgEnum("reaction_target", ["expense", "deposit"]);

/** One emoji per person per pulse item; tapping another emoji replaces it. */
export const reaction = pgTable(
	"reaction",
	{
		id: id(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		targetKind: reactionTarget().notNull(),
		targetId: uuid().notNull(),
		emoji: text().notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("reaction_once_idx").on(t.userId, t.targetKind, t.targetId),
		index("reaction_target_idx").on(t.targetKind, t.targetId),
	],
);

/** People the goal's owner invited to save into a shared jar. */
export const goalMember = pgTable(
	"goal_member",
	{
		goalId: uuid()
			.notNull()
			.references(() => goal.id, { onDelete: "cascade" }),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		joinedAt: createdAt(),
	},
	(t) => [
		primaryKey({ columns: [t.goalId, t.userId] }),
		index("goal_member_user_idx").on(t.userId),
	],
);

/** Money put into (or taken out of) a jar, in the goal's currency. */
export const goalDeposit = pgTable(
	"goal_deposit",
	{
		id: id(),
		goalId: uuid()
			.notNull()
			.references(() => goal.id, { onDelete: "cascade" }),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		amountMinor: bigint({ mode: "number" }).notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		index("goal_deposit_goal_idx").on(t.goalId, t.createdAt),
		index("goal_deposit_user_idx").on(t.userId),
	],
);

/**
 * A bill split. `people` and `items` follow `SplitInputSchema`; `paid` lists the people
 * keys marked as paid. `publicToken` opens the read-only split link.
 */
export const split = pgTable(
	"split",
	{
		id: id(),
		ownerId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: text().notNull(),
		currency: char({ length: 3 }).notNull(),
		data: jsonb().notNull(),
		paid: jsonb().notNull().default([]),
		publicToken: text().notNull().unique(),
		createdAt: createdAt(),
	},
	(t) => [index("split_owner_idx").on(t.ownerId, t.createdAt)],
);
