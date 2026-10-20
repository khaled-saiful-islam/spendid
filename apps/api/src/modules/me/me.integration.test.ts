import { createDb, transaction } from "@spendid/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "../money/categories.repository";
import { createSummaryService } from "../money/summary.service";
import { createMeRepository } from "./me.repository";

const url = testDbUrl();

describe.skipIf(!url)("profile (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	const me = createMeRepository(db);
	const base = {
		name: "Test Person",
		locale: "en" as const,
		timeZone: "Asia/Kuala_Lumpur",
		monthlyIncomeMinor: 500_000,
		budgetMethod: "fifty_thirty_twenty" as const,
	};

	beforeAll(() => seedCategories(db));
	afterAll(() => database.close());

	it("lets a new person pick any home currency", async () => {
		const fresh = await createPerson(db, { currency: "MYR" });
		const saved = await me.saveProfile(fresh, { ...base, homeCurrency: "SGD" });
		expect(saved.profile.homeCurrency).toBe("SGD");
		expect(saved.currencyLocked).toBe(false);
	});

	it("saves without a plan, and safe to spend still works from income", async () => {
		const fresh = await createPerson(db, { currency: "MYR" });
		const saved = await me.saveProfile(fresh, {
			...base,
			homeCurrency: "MYR",
			monthlyIncomeMinor: 310_000,
			budgetMethod: null,
		});
		expect(saved.profile.budgetMethod).toBeNull();
		const s = await createSummaryService(db).forUser(fresh);
		expect(s.method).toBeNull();
		expect(s.reservedMinor).toBe(0);
		expect(s.safe.leftThisMonthMinor).toBe(310_000);
		// A plan can be picked later.
		const later = await me.saveProfile(fresh, {
			...base,
			homeCurrency: "MYR",
			budgetMethod: "envelope",
		});
		expect(later.profile.budgetMethod).toBe("envelope");
	});

	it("keeps the home currency once spending exists, so totals never mix currencies", async () => {
		const maya = await createPerson(db, { currency: "MYR" });
		const food = (await createCategoryRepository(db).listFor(maya)).find(
			(c) => c.slug === "food",
		);
		await db.insert(transaction).values({
			userId: maya,
			categoryId: food?.id ?? "",
			merchant: "Lunch",
			amountMinor: 1_200,
			currency: "MYR",
			homeAmountMinor: 1_200,
			homeCurrency: "MYR",
			occurredAt: new Date(),
		});
		expect((await me.find(maya))?.currencyLocked).toBe(true);
		await expect(
			me.saveProfile(maya, { ...base, homeCurrency: "SGD" }),
		).rejects.toThrow(/currency/i);
		// Everything else still saves.
		const ok = await me.saveProfile(maya, {
			...base,
			homeCurrency: "MYR",
			monthlyIncomeMinor: 650_000,
		});
		expect(ok.profile.monthlyIncomeMinor).toBe(650_000);
	});
});
