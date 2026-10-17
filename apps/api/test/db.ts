import { randomUUID } from "node:crypto";
import { type Db, profile, user } from "@spendid/db";

/** Same server as dev, separate `spendid_test` database. Null when no database is configured. */
export function testDbUrl(): string | null {
	const base = process.env.DATABASE_URL;
	if (!base) return null;
	const url = new URL(base);
	url.pathname = "/spendid_test";
	return url.toString();
}

/** Inserts a person with an onboarded profile and returns their id. */
export async function createPerson(
	db: Db,
	opts: {
		role?: "user" | "admin";
		incomeMinor?: number | null;
		currency?: string;
	} = {},
): Promise<string> {
	const id = randomUUID();
	await db.insert(user).values({
		id,
		name: "Test Person",
		email: `${id}@test.local`,
		emailVerified: true,
		role: opts.role ?? "user",
	});
	await db.insert(profile).values({
		userId: id,
		homeCurrency: opts.currency ?? "MYR",
		timeZone: "Asia/Kuala_Lumpur",
		monthlyIncomeMinor:
			opts.incomeMinor === undefined ? 600_000 : opts.incomeMinor,
		budgetMethod: "envelope",
		onboardedAt: new Date(),
	});
	return id;
}
