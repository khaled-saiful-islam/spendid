import { sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * One Ask Spendid conversation, saved so earlier chats stay available on every device.
 * Only the owner can read it; admins have no route to it. The id comes from the app.
 */
export const askThread = pgTable(
	"ask_thread",
	{
		id: uuid().primaryKey(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: text().notNull(),
		messages: jsonb().notNull().default(sql`'[]'::jsonb`),
		messageCount: integer().notNull().default(0),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("ask_thread_user_recent_idx").on(t.userId, t.updatedAt.desc())],
);
