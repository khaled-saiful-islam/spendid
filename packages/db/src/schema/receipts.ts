import { sql } from "drizzle-orm";
import {
	bigint,
	char,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { transaction } from "./money";

const id = () =>
	uuid()
		.primaryKey()
		.default(sql`uuidv7()`);

export const receiptStatus = pgEnum("receipt_status", ["reading", "ready", "failed", "saved"]);

/**
 * A photographed receipt. The image lives encrypted on disk (`fileKey`); `draft` is what the
 * AI read, waiting for the person to check it. Saving links it to the expense it became.
 */
export const receipt = pgTable(
	"receipt",
	{
		id: id(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: receiptStatus().notNull().default("reading"),
		fileKey: text().notNull(),
		mime: text().notNull(),
		bytes: integer().notNull(),
		draft: jsonb(),
		error: text(),
		transactionId: uuid().references(() => transaction.id, { onDelete: "set null" }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("receipt_user_status_idx").on(t.userId, t.status, t.createdAt)],
);

/** One line on a receipt. `itemKey` groups the same product across receipts (price memory). */
export const transactionItem = pgTable(
	"transaction_item",
	{
		id: id(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		transactionId: uuid()
			.notNull()
			.references(() => transaction.id, { onDelete: "cascade" }),
		name: text().notNull(),
		itemKey: text().notNull(),
		quantity: numeric({ precision: 10, scale: 3 }).notNull().default("1"),
		unitPriceMinor: bigint({ mode: "number" }).notNull(),
		totalMinor: bigint({ mode: "number" }).notNull(),
		currency: char({ length: 3 }).notNull(),
		boughtAt: timestamp({ withTimezone: true }).notNull(),
	},
	(t) => [
		index("item_user_key_time_idx").on(t.userId, t.itemKey, t.boughtAt),
		index("item_transaction_idx").on(t.transactionId),
	],
);

/** Warranty vault: a reminder before cover ends. */
export const warranty = pgTable(
	"warranty",
	{
		id: id(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		transactionId: uuid()
			.notNull()
			.references(() => transaction.id, { onDelete: "cascade" }),
		itemName: text().notNull(),
		purchasedOn: date({ mode: "string" }).notNull(),
		months: integer().notNull(),
		endsOn: date({ mode: "string" }).notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("warranty_user_ends_idx").on(t.userId, t.endsOn)],
);
