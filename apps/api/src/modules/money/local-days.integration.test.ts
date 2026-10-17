import { createDb, transaction } from "@spendid/db";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "./categories.repository";
import { onLocalDays } from "./local-days";

const url = testDbUrl();

describe.skipIf(!url)("onLocalDays (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	afterAll(() => database.close());

	it("counts days in the person's time zone, and Postgres can use the index", async () => {
		await seedCategories(db);
		const maya = await createPerson(db);
		const [food] = await createCategoryRepository(db).listFor(maya);
		const at = (iso: string) => ({
			userId: maya,
			categoryId: food?.id ?? "",
			amountMinor: 100,
			currency: "MYR",
			homeAmountMinor: 100,
			homeCurrency: "MYR",
			occurredAt: new Date(iso),
		});
		// Kuala Lumpur is UTC+8: 15:30Z on the 31st is still October there, 16:30Z is November.
		await db
			.insert(transaction)
			.values([at("2026-10-31T15:30:00Z"), at("2026-10-31T16:30:00Z")]);
		const october = await db
			.select({ at: transaction.occurredAt })
			.from(transaction)
			.where(
				and(
					eq(transaction.userId, maya),
					onLocalDays(
						transaction.occurredAt,
						"Asia/Kuala_Lumpur",
						"2026-10-01",
						"2026-11-01",
					),
				),
			);
		expect(october.map((r) => r.at.toISOString())).toEqual([
			"2026-10-31T15:30:00.000Z",
		]);

		const plan = await db.execute(
			sql`explain select 1 from ${transaction} where ${eq(transaction.userId, maya)} and ${onLocalDays(transaction.occurredAt, "Asia/Kuala_Lumpur", "2026-10-01", "2026-11-01")}`,
		);
		expect(JSON.stringify(plan)).toMatch(/Index Cond: .*occurred_at/);
	});
});
