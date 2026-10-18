import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	vector,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { category } from "./money";

/** bge-m3 via ILMU: multilingual, so "Kedai Runcit Ah Seng" and "AH SENG GROCERY" land close. */
export const MERCHANT_EMBEDDING_DIMS = 1024;

/**
 * Shops someone has bought from: a clean name, the category they last chose for it
 * (smart categories), and an embedding to merge spelling variants (merchant clean-up).
 */
export const merchant = pgTable(
	"merchant",
	{
		id: uuid().primaryKey().default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		key: text().notNull(),
		name: text().notNull(),
		categoryId: uuid().references(() => category.id, { onDelete: "set null" }),
		embedding: vector({ dimensions: MERCHANT_EMBEDDING_DIMS }),
		uses: integer().notNull().default(1),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("merchant_user_key_idx").on(t.userId, t.key),
		index("merchant_category_idx").on(t.categoryId),
		index("merchant_embedding_idx").using(
			"hnsw",
			t.embedding.op("vector_cosine_ops"),
		),
	],
);

/** Which optional emails someone wants. Security and account emails always go out. */
export const notificationPref = pgTable("notification_pref", {
	userId: text()
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	weekly: boolean().notNull().default(true),
	budget: boolean().notNull().default(true),
	unusual: boolean().notNull().default(true),
	bills: boolean().notNull().default(true),
	warranty: boolean().notNull().default(true),
	goals: boolean().notNull().default(true),
	wrapped: boolean().notNull().default(true),
	family: boolean().notNull().default(true),
	product: boolean().notNull().default(true),
	/** Show "•••" instead of amounts in emails. */
	hideAmounts: boolean().notNull().default(false),
	/** Local hours; emails that would land inside wait until quietEnd. Equal hours = no quiet time. */
	quietStart: smallint().notNull().default(22),
	quietEnd: smallint().notNull().default(8),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

/** One row per alert actually sent, so the same alert never goes out twice. */
export const notificationLog = pgTable(
	"notification_log",
	{
		id: uuid().primaryKey().default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text().notNull(),
		dedupeKey: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("notification_once_idx").on(t.userId, t.kind, t.dedupeKey),
	],
);

/**
 * The in-app inbox (the bell): every alert also lands here, even when its email is off.
 * Only the person's own notices; they're marked read when the inbox is opened.
 */
export const inAppNotice = pgTable(
	"in_app_notice",
	{
		id: uuid().primaryKey().default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text().notNull(),
		title: text().notNull(),
		body: text().notNull(),
		/** Where tapping it goes, inside the app ("/app/subscriptions"). */
		path: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		readAt: timestamp({ withTimezone: true }),
	},
	(t) => [index("in_app_notice_user_idx").on(t.userId, t.createdAt)],
);

/** Browsers someone has signed in from (hashed), for "new sign-in" emails. */
export const knownDevice = pgTable(
	"known_device",
	{
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		fingerprint: text().notNull(),
		label: text().notNull(),
		firstSeen: timestamp({ withTimezone: true }).notNull().defaultNow(),
		lastSeen: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.fingerprint] })],
);

/** Product news an admin sent. Never contains anyone's data. */
export const announcement = pgTable("announcement", {
	id: uuid().primaryKey().default(sql`uuidv7()`),
	subject: text().notNull(),
	body: text().notNull(),
	createdBy: text().references(() => user.id, { onDelete: "set null" }),
	recipients: integer().notNull().default(0),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
