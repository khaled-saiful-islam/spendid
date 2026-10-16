import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

/*
 * Better Auth tables (core + admin + username + passkey plugins).
 * Property names must match Better Auth's field names; columns are snake_case.
 */

const timestamps = {
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
};

export const user = pgTable("user", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: boolean().notNull().default(false),
	image: text(),
	username: text().unique(),
	displayUsername: text(),
	role: text().notNull().default("user"),
	banned: boolean().notNull().default(false),
	banReason: text(),
	banExpires: timestamp({ withTimezone: true }),
	...timestamps,
});

export const session = pgTable(
	"session",
	{
		id: text().primaryKey(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		token: text().notNull().unique(),
		ipAddress: text(),
		userAgent: text(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		impersonatedBy: text(),
		...timestamps,
	},
	(t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text().primaryKey(),
		accountId: text().notNull(),
		providerId: text().notNull(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text(),
		refreshToken: text(),
		idToken: text(),
		accessTokenExpiresAt: timestamp({ withTimezone: true }),
		refreshTokenExpiresAt: timestamp({ withTimezone: true }),
		scope: text(),
		password: text(),
		...timestamps,
	},
	(t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text().primaryKey(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		...timestamps,
	},
	(t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const passkey = pgTable(
	"passkey",
	{
		id: text().primaryKey(),
		name: text(),
		publicKey: text().notNull(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialID: text().notNull(),
		counter: integer().notNull(),
		deviceType: text().notNull(),
		backedUp: boolean().notNull(),
		transports: text(),
		aaguid: text(),
		createdAt: timestamp({ withTimezone: true }).defaultNow(),
	},
	(t) => [index("passkey_user_id_idx").on(t.userId)],
);
