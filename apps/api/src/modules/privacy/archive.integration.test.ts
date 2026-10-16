import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { category, createDb, transaction } from "@spendid/db";
import { createFileStore } from "@spendid/server";
import { and, eq, isNull } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { buildArchive, toCsv } from "./archive";

const url = testDbUrl();

describe("toCsv", () => {
	it("keeps formula-looking text as text but leaves numbers alone", () => {
		const csv = toCsv([['=HYPERLINK("x")', "-12.50", "@shop", "+60 12", 7]]);
		expect(csv).toBe('"\'=HYPERLINK(""x"")","-12.50","\'@shop","\'+60 12","7"');
	});
});

describe.skipIf(!url)("data export archive (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	let root: string;
	let maya: string;
	let sam: string;

	beforeAll(async () => {
		await seedCategories(db);
		root = await mkdtemp(join(tmpdir(), "spendid-export-"));
		maya = await createPerson(db);
		sam = await createPerson(db);
		const [food] = await db
			.select({ id: category.id })
			.from(category)
			.where(and(eq(category.slug, "food"), isNull(category.userId)))
			.limit(1);
		if (!food) throw new Error("food category missing");
		const spend = (userId: string, merchant: string, amountMinor: number) => ({
			userId,
			merchant,
			amountMinor,
			currency: "MYR",
			homeAmountMinor: amountMinor,
			homeCurrency: "MYR",
			categoryId: food.id,
			occurredAt: new Date(),
		});
		await db
			.insert(transaction)
			.values([
				spend(maya, 'Mamak, "corner" stall', 1250),
				spend(sam, "Sam's secret shop", 9900),
			]);
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
		await database.close();
	});

	it("holds every file, only the owner's spending, and a CSV that survives commas and quotes", async () => {
		const store = createFileStore({
			root,
			keyBase64: Buffer.alloc(32, 7).toString("base64"),
		});
		const files = unzipSync(await buildArchive(db, store, maya));

		expect(Object.keys(files)).toEqual(
			expect.arrayContaining([
				"README.txt",
				"account.json",
				"transactions.csv",
				"transactions.json",
				"goals.json",
				"family.json",
			]),
		);
		const csv = strFromU8(files["transactions.csv"] ?? new Uint8Array());
		const json = strFromU8(files["transactions.json"] ?? new Uint8Array());
		expect(csv).toContain('"Mamak, ""corner"" stall"');
		expect(csv).toContain("12.50");
		expect(`${csv}${json}`).not.toContain("Sam's secret shop");
	});
});
