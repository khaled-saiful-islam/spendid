import { sql } from "drizzle-orm";
import {
	bigint,
	char,
	check,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const budgetMethod = pgEnum("budget_method", [
	"envelope",
	"zero_based",
	"fifty_thirty_twenty",
]);

/** One row per person: money settings chosen during onboarding. */
export const profile = pgTable(
	"profile",
	{
		userId: text()
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		homeCurrency: char({ length: 3 }).notNull().default("MYR"),
		locale: text().notNull().default("en"),
		timeZone: text().notNull().default("Asia/Kuala_Lumpur"),
		monthlyIncomeMinor: bigint({ mode: "number" }),
		budgetMethod: budgetMethod().notNull().default("fifty_thirty_twenty"),
		onboardedAt: timestamp({ withTimezone: true }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		check("profile_currency_code", sql`${t.homeCurrency} ~ '^[A-Z]{3}$'`),
		check(
			"profile_income_not_negative",
			sql`${t.monthlyIncomeMinor} is null or ${t.monthlyIncomeMinor} >= 0`,
		),
	],
);
