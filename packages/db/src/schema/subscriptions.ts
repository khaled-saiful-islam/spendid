import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	char,
	date,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { category } from "./money";

export const billingCycle = pgEnum("billing_cycle", [
	"weekly",
	"monthly",
	"quarterly",
	"yearly",
]);

/**
 * A subscription or regular bill the person added (Netflix, Unifi, gym, insurance…).
 * Due amounts this month are kept aside in safe-to-spend; a reminder goes out `remindDays`
 * before `nextDue`. Paying it (by tapping Mark paid, or logging the expense) moves `nextDue` on.
 */
export const subscription = pgTable(
	"subscription",
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text().notNull(),
		/** A known service (e.g. "netflix") for its colour and initials; null for custom ones. */
		brand: text(),
		amountMinor: bigint({ mode: "number" }).notNull(),
		currency: char({ length: 3 }).notNull(),
		/** Bills like electricity change each time; the amount is then a typical one. */
		amountVaries: boolean().notNull().default(false),
		cycle: billingCycle().notNull().default("monthly"),
		nextDue: date({ mode: "string" }).notNull(),
		/** Day of the month it's due (1-31), so "the 31st" stays the 31st after a short month. */
		dueDay: integer().notNull().default(1),
		remindDays: integer().notNull().default(3),
		categoryId: uuid()
			.notNull()
			.references(() => category.id),
		note: text(),
		lastPaidOn: date({ mode: "string" }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		/** Set when cancelled; kept so "you saved RM X since cancelling" can be shown. */
		cancelledAt: timestamp({ withTimezone: true }),
	},
	(t) => [index("subscription_user_due_idx").on(t.userId, t.nextDue)],
);
