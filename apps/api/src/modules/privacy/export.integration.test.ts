import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { category, createDb, transaction } from "@spendid/db";
import { createFileStore } from "@spendid/server";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { gatherExport, toCsv } from "./export-data";
import { pdfText, renderReport } from "./report";

const url = testDbUrl();

describe("toCsv", () => {
	it("keeps formula-looking text as text but leaves numbers alone", () => {
		const csv = toCsv([['=HYPERLINK("x")', "-12.50", "@shop", "+60 12", 7]]);
		expect(csv).toBe('"\'=HYPERLINK(""x"")","-12.50","\'@shop","\'+60 12","7"');
	});
});

describe("pdfText", () => {
	it("keeps accents and money symbols, drops emoji, marks other scripts", () => {
		expect(pdfText("Café “Kopi” €3")).toBe("Café “Kopi” €3");
		expect(pdfText("🏝️ Bali trip")).toBe("Bali trip");
		expect(pdfText("面包 shop")).toBe("?? shop");
	});
});

describe.skipIf(!url)("data export PDF (real database)", () => {
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

	it("is a PDF with the owner's spending attached as a spreadsheet, and nobody else's", async () => {
		const store = createFileStore({
			root,
			keyBase64: Buffer.alloc(32, 7).toString("base64"),
		});
		const pdf = await renderReport(await gatherExport(db, store, maya), {
			compress: false,
		});
		const text = pdf.toString("latin1");

		expect(text.startsWith("%PDF-")).toBe(true);
		expect(text).toContain("/EmbeddedFile");
		expect(text).toContain("spendid-expenses-");
		expect(text).toContain("spendid-data-");
		expect(text).toContain('"Mamak, ""corner"" stall"');
		expect(text).toContain("12.50");
		expect(text).not.toContain("Sam's secret shop");
	});
});
