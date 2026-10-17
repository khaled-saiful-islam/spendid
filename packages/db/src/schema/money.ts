import { sql } from "drizzle-orm";
import {
	bigint,
	char,
	check,
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const id = () => uuid().primaryKey().default(sql`uuidv7()`);
const createdAt = () =>
	timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
	timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());

/** need / want / saving drive the 50-30-20 view. */
export const categoryKind = pgEnum("category_kind", ["need", "want", "saving"]);
export const entrySource = pgEnum("entry_source", [
	"manual",
	"voice",
	"photo",
	"chat",
]);

/** System categories have no owner; people can add their own later. */
export const category = pgTable(
	"category",
	{
		id: id(),
		userId: text().references(() => user.id, { onDelete: "cascade" }),
		slug: text().notNull(),
		name: text().notNull(),
		icon: text().notNull(),
		tint: text().notNull(),
		kind: categoryKind().notNull(),
		sort: integer().notNull().default(100),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("category_owner_slug_idx").on(
			sql`coalesce(${t.userId}, '')`,
			t.slug,
		),
		index("category_user_idx").on(t.userId),
	],
);

/**
 * One spend. `amountMinor` is in `currency`; `homeAmountMinor` is the same spend in the
 * person's home currency at `fxRate` (home units per 1 unit of `currency`).
 * Soft-deleted rows keep `deletedAt` so "Undo" can restore them.
 */
export const transaction = pgTable(
	"transaction",
	{
		id: id(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		amountMinor: bigint({ mode: "number" }).notNull(),
		currency: char({ length: 3 }).notNull(),
		homeAmountMinor: bigint({ mode: "number" }).notNull(),
		homeCurrency: char({ length: 3 }).notNull(),
		fxRate: numeric({ precision: 20, scale: 10 }).notNull().default("1"),
		categoryId: uuid()
			.notNull()
			.references(() => category.id),
		merchant: text(),
		note: text(),
		source: entrySource().notNull().default("manual"),
		occurredAt: timestamp({ withTimezone: true }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: timestamp({ withTimezone: true }),
	},
	(t) => [
		index("transaction_user_time_idx").on(
			t.userId,
			t.occurredAt.desc(),
			t.id.desc(),
		),
		index("transaction_user_category_idx").on(t.userId, t.categoryId),
		// Deleting a custom category (or an account's categories) finds its expenses fast.
		index("transaction_category_idx").on(t.categoryId),
		// The last line of defence behind the API's validation.
		check("transaction_amount_positive", sql`${t.amountMinor} > 0`),
		check("transaction_home_amount_positive", sql`${t.homeAmountMinor} >= 0`),
		check("transaction_currency_code", sql`${t.currency} ~ '^[A-Z]{3}$'`),
		check(
			"transaction_home_currency_code",
			sql`${t.homeCurrency} ~ '^[A-Z]{3}$'`,
		),
	],
);

/** Monthly limit per category (envelope / zero-based styles). */
export const budget = pgTable(
	"budget",
	{
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		categoryId: uuid()
			.notNull()
			.references(() => category.id, { onDelete: "cascade" }),
		monthlyLimitMinor: bigint({ mode: "number" }).notNull(),
		updatedAt: updatedAt(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.categoryId] }),
		index("budget_category_idx").on(t.categoryId),
		check("budget_limit_not_negative", sql`${t.monthlyLimitMinor} >= 0`),
	],
);

/** A savings goal. Amounts are in the owner's home currency. */
export const goal = pgTable(
	"goal",
	{
		id: id(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text().notNull(),
		emoji: text().notNull().default("🎯"),
		targetMinor: bigint({ mode: "number" }).notNull(),
		savedMinor: bigint({ mode: "number" }).notNull().default(0),
		targetDate: date({ mode: "string" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		archivedAt: timestamp({ withTimezone: true }),
	},
	(t) => [
		index("goal_user_idx").on(t.userId),
		check("goal_target_positive", sql`${t.targetMinor} > 0`),
		check("goal_saved_not_negative", sql`${t.savedMinor} >= 0`),
	],
);

/** Daily reference rates, base EUR (ECB via Frankfurter). */
export const fxRate = pgTable(
	"fx_rate",
	{
		day: date({ mode: "string" }).notNull(),
		currency: char({ length: 3 }).notNull(),
		perEur: numeric({ precision: 20, scale: 10 }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.day, t.currency] })],
);
