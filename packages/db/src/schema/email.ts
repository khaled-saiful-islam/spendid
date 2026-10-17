import { sql } from "drizzle-orm";
import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const emailStatus = pgEnum("email_status", ["queued", "sent", "failed"]);

/**
 * Delivery record for every email. Stores the type and outcome only —
 * never the body or the amounts in it, so admins can see delivery health safely.
 */
export const emailLog = pgTable(
	"email_log",
	{
		id: uuid().primaryKey().default(sql`uuidv7()`),
		userId: text().references(() => user.id, { onDelete: "set null" }),
		type: text().notNull(),
		status: emailStatus().notNull().default("queued"),
		error: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		sentAt: timestamp({ withTimezone: true }),
	},
	(t) => [
		index("email_log_created_idx").on(t.createdAt),
		index("email_log_user_idx").on(t.userId),
	],
);
