import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * One row per AI call. Counts only — never the audio, the words, or the result —
 * so admins can manage AI cost without seeing anything private.
 */
export const aiUsage = pgTable(
	"ai_usage",
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		feature: text().notNull(),
		model: text().notNull(),
		inputTokens: integer().notNull().default(0),
		outputTokens: integer().notNull().default(0),
		audioSeconds: integer().notNull().default(0),
		/** Tokens counted against the monthly allowance (audio converted to tokens). */
		billedTokens: integer().notNull().default(0),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("ai_usage_user_time_idx").on(t.userId, t.createdAt)],
);

/** Per-person AI settings an admin can change. No row = app default. */
export const aiLimit = pgTable("ai_limit", {
	userId: text()
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	monthlyTokens: integer(),
	enabled: boolean().notNull().default(true),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});
