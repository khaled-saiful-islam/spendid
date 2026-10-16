import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** App-wide switches an admin can change (e.g. AI on/off for everyone). */
export const appSetting = pgTable("app_setting", {
	key: text().primaryKey(),
	value: jsonb().notNull(),
	updatedBy: text().references(() => user.id, { onDelete: "set null" }),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

/**
 * Every admin action, for accountability. `detail` holds settings and reasons only —
 * never anyone's money.
 */
export const auditLog = pgTable(
	"audit_log",
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		actorId: text().references(() => user.id, { onDelete: "set null" }),
		action: text().notNull(),
		targetUserId: text().references(() => user.id, { onDelete: "set null" }),
		targetLabel: text(),
		detail: jsonb(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("audit_created_idx").on(t.createdAt)],
);
