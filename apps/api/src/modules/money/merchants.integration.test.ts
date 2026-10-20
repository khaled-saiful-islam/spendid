import {
	createDb,
	MERCHANT_EMBEDDING_DIMS,
	merchant,
	transaction,
} from "@spendid/db";
import {
	type AiGuard,
	createMerchantMatcher,
	createMerchantMemory,
	type Embedder,
} from "@spendid/server";
import { type Category, cleanMerchant, merchantKey } from "@spendid/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "./categories.repository";
import { createFxRepository } from "./fx.repository";
import { createTransactionRepository } from "./transactions.repository";
import { createTransactionService } from "./transactions.service";

const url = testDbUrl();

/** Vectors chosen per name, so "close in meaning" is set by the test. */
const unit = (i: number) =>
	Array.from({ length: MERCHANT_EMBEDDING_DIMS }, (_, j) => (j === i ? 1 : 0));
/** Very close to `base` (cosine distance about 0.001), like two names that mean nearly the same. */
const near = (base: number[], j: number) =>
	base.map((v, k) => (k === j ? 0.05 : v));

describe.skipIf(!url)("shop names (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	const vectors = new Map<string, number[]>();
	const embed: Embedder = async (texts) => ({
		vectors: texts.map((t) => vectors.get(t) ?? unit(900)),
		tokens: 1,
		model: "test",
	});
	const guard = {
		status: async () => ({
			enabled: true,
			pausedForEveryone: false,
			usedTokens: 0,
			limitTokens: 1e9,
		}),
		record: async () => {},
	} as unknown as AiGuard;
	const memory = createMerchantMemory(db);
	const match = createMerchantMatcher({ db, embed, guard });
	let categories: Category[];
	const id = (slug: string) =>
		categories.find((c) => c.slug === slug)?.id ?? "";

	/** Saves an expense the way the app does, then runs the background name matching. */
	async function spend(
		userId: string,
		name: string,
		slug: string,
		vector: number[],
	): Promise<string> {
		vectors.set(merchantKey(name), vector);
		const [row] = await db
			.insert(transaction)
			.values({
				userId,
				categoryId: id(slug),
				merchant: cleanMerchant(name),
				amountMinor: 1200,
				currency: "MYR",
				homeAmountMinor: 1200,
				homeCurrency: "MYR",
				occurredAt: new Date(),
			})
			.returning({ id: transaction.id });
		const learned = await memory.remember(userId, name, id(slug));
		if (learned) await match(learned.row.id);
		return row?.id ?? "";
	}

	const nameOf = async (txId: string) =>
		(
			await db
				.select({ merchant: transaction.merchant })
				.from(transaction)
				.where(eq(transaction.id, txId))
		)[0]?.merchant;

	beforeAll(async () => {
		await seedCategories(db);
		categories = await createCategoryRepository(db).listFor(
			await createPerson(db),
		);
	});
	afterAll(() => database.close());

	it("a different meal in the same place keeps its own name", async () => {
		const me = await createPerson(db);
		const office = unit(1);
		await spend(me, "For breakfast in office", "food", office);
		const lunch = await spend(me, "Lunch in office", "food", near(office, 2));
		expect(await nameOf(lunch)).toBe("Lunch in office");
		expect(await memory.displayName(me, "lunch in office")).toBe(
			"Lunch in office",
		);
	});

	it("still merges one shop written two ways", async () => {
		const me = await createPerson(db);
		const tealive = unit(3);
		await spend(me, "Tealive", "food", tealive);
		const klcc = await spend(me, "TEALIVE KLCC", "food", near(tealive, 4));
		expect(await nameOf(klcc)).toBe("Tealive");
		expect(await memory.displayName(me, "tealive klcc")).toBe("Tealive");
	});

	it("keeps apart close names in different categories (Grab rides, Grab Food)", async () => {
		const me = await createPerson(db);
		const grab = unit(5);
		await spend(me, "Grab", "transport", grab);
		const food = await spend(me, "Grab Food", "food", near(grab, 6));
		expect(await nameOf(food)).toBe("Grab Food");
	});

	it("an edit keeps the name as typed, and teaches it for next time", async () => {
		const me = await createPerson(db);
		const service = createTransactionService({
			db,
			transactions: createTransactionRepository(db),
			categories: createCategoryRepository(db),
			fx: createFxRepository(db),
			merchants: memory,
		});
		// A wrong merge from before this fix: "lunch in office" shows as the breakfast name.
		const saved = await service.create(me, {
			amountMinor: 1200,
			currency: "MYR",
			categoryId: id("food"),
			merchant: "For breakfast in office",
		});
		await memory.remember(me, "Lunch in office", id("food"));
		await db
			.update(transaction)
			.set({ merchant: "For breakfast in office" })
			.where(and(eq(transaction.userId, me), eq(transaction.id, saved.id)));
		await db
			.update(merchant)
			.set({ name: "For breakfast in office" })
			.where(and(eq(merchant.userId, me), eq(merchant.key, "lunch in office")));

		const edited = await service.update(me, saved.id, {
			merchant: "Lunch in office",
		});
		expect(edited.merchant).toBe("Lunch in office");
		expect(await memory.displayName(me, "lunch in office")).toBe(
			"Lunch in office",
		);
		const next = await service.create(me, {
			amountMinor: 1500,
			currency: "MYR",
			categoryId: id("food"),
			merchant: "lunch in office",
		});
		expect(next.merchant).toBe("Lunch in office");
	});
});
