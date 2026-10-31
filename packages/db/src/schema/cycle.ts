import { sql } from "drizzle-orm";
import {
	bigint,
	check,
	date,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const cycleStatus = pgEnum("cycle_status", ["set", "draft"]);

/**
 * One budget cycle, start and end included (the person's own days). Overlaps are refused by
 * `pay_cycle_no_overlap`, an exclusion constraint added by hand in migration 0021.
 */
export const payCycle = pgTable(
	"pay_cycle",
	{
		id: uuid().primaryKey().default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		startsOn: date().notNull(),
		endsOn: date().notNull(),
		incomeMinor: bigint({ mode: "number" }).notNull(),
		status: cycleStatus().notNull().default("set"),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("pay_cycle_user_idx").on(t.userId, t.startsOn),
		check(
			"pay_cycle_length",
			sql`${t.endsOn} between ${t.startsOn} + 6 and ${t.startsOn} + 61`,
		),
		check("pay_cycle_income_not_negative", sql`${t.incomeMinor} >= 0`),
	],
);
