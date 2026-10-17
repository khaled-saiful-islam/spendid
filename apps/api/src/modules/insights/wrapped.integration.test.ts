import { createDb, transaction } from "@spendid/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "../money/categories.repository";
import { createInsightsService } from "./insights.service";

const url = testDbUrl();

describe.skipIf(!url)("Money Wrapped (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	const insights = createInsightsService(db);
	beforeAll(() => seedCategories(db));
	afterAll(() => database.close());

	it("picks a favourite place you chose to go, not a bill", async () => {
		const maya = await createPerson(db);
		const cats = await createCategoryRepository(db).listFor(maya);
		const id = (slug: string) => cats.find((c) => c.slug === slug)?.id ?? "";
		const spend = (slug: string, merchant: string, minor: number) => ({
			userId: maya,
			categoryId: id(slug),
			merchant,
			amountMinor: minor,
			currency: "MYR",
			homeAmountMinor: minor,
			homeCurrency: "MYR",
			occurredAt: new Date(),
		});
		await db
			.insert(transaction)
			.values([
				spend("bills", "Unifi", 12_900),
				spend("bills", "Unifi", 12_900),
				spend("bills", "Unifi", 12_900),
				spend("food", "ZUS Coffee", 1_200),
				spend("food", "ZUS Coffee", 1_100),
			]);
		const wrapped = await insights.wrapped(maya);
		expect(wrapped.topMerchant?.name).toBe("ZUS Coffee");
	});
});
