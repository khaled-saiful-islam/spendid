import { sql } from "drizzle-orm";
import {
	bigint,
	char,
	date,
	index,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const checkInKind = pgEnum("check_in_kind", ["all-logged", "nothing"]);

/** The nightly "anything I missed?" answer for one local day. Counts toward the streak. */
export const checkIn = pgTable(
	"check_in",
	{
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		day: date({ mode: "string" }).notNull(),
		kind: checkInKind().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const wishDecision = pgEnum("wish_decision", ["bought", "skipped"]);

/** Impulse pause: something wanted, waiting out a cooldown before buy or skip. */
export const wish = pgTable(
	"wish",
	{
		id: uuid().primaryKey().default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text().notNull(),
		priceMinor: bigint({ mode: "number" }).notNull(),
		currency: char({ length: 3 }).notNull(),
		link: text(),
		coolUntil: timestamp({ withTimezone: true }).notNull(),
		decision: wishDecision(),
		decidedAt: timestamp({ withTimezone: true }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("wish_user_idx").on(t.userId, t.createdAt)],
);
