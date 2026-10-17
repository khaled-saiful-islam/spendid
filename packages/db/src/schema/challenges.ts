import { sql } from "drizzle-orm";
import { bigint, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * A challenge someone started (no-spend weekend, cook-at-home week…). Progress is worked out
 * from their spending each time; `outcome` is written once it's decided.
 */
export const challenge = pgTable(
	"challenge",
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text().notNull(),
		targetMinor: bigint({ mode: "number" }),
		startDay: date({ mode: "string" }).notNull(),
		endDay: date({ mode: "string" }).notNull(),
		/** "won", "lost" or "gave-up"; null while it runs. */
		outcome: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		endedAt: timestamp({ withTimezone: true }),
	},
	(t) => [index("challenge_user_idx").on(t.userId, t.endDay)],
);
