import { createDb, fxRate } from "@spendid/db";
import type {
	Category,
	Summary,
	Transaction,
	TransactionPage,
} from "@spendid/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { buildApp } from "../../app";
import type { SessionLookup } from "../../auth/guards";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "./categories.repository";
import { createFxRepository } from "./fx.repository";
import { createPlanRepository } from "./plan.repository";
import { createSummaryService } from "./summary.service";
import { createTransactionRepository } from "./transactions.repository";
import { createTransactionService } from "./transactions.service";

const url = testDbUrl();

describe.skipIf(!url)("money API (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 4);
	const db = database.db;
	let app: FastifyInstance;
	let maya: string;
	let sam: string;
	let admin: string;
	let food: Category;

	// Tests pick who is signed in with an `x-test-user` header.
	const session: SessionLookup = async (headers) => {
		const id = headers.get("x-test-user");
		if (!id) return null;
		return {
			id,
			name: "T",
			email: "t@test.local",
			emailVerified: true,
			role: id === admin ? "admin" : "user",
		};
	};

	const as = (userId: string) => ({ "x-test-user": userId });
	const call = async <T>(
		userId: string,
		method: "GET" | "POST" | "PATCH" | "DELETE",
		path: string,
		payload?: object,
	) => {
		const res = await app.inject({
			method,
			url: `/api${path}`,
			headers: as(userId),
			payload,
		});
		return {
			status: res.statusCode,
			body: res.json() as { success: boolean; data: T; error?: string },
		};
	};

	beforeAll(async () => {
		await seedCategories(db);
		const today = new Date().toISOString().slice(0, 10);
		await db
			.insert(fxRate)
			.values([
				{ day: today, currency: "MYR", perEur: "4.5757" },
				{ day: today, currency: "USD", perEur: "1.12" },
			])
			.onConflictDoNothing();
		maya = await createPerson(db);
		sam = await createPerson(db);
		admin = await createPerson(db, { role: "admin" });

		const categories = createCategoryRepository(db);
		const transactions = createTransactionRepository(db);
		app = await buildApp({
			checks: { database: database.ping, redis: async () => true },
			money: {
				session,
				categories,
				transactions,
				transactionService: createTransactionService({
					db,
					transactions,
					categories,
					fx: createFxRepository(db),
				}),
				summary: createSummaryService(db),
				plan: createPlanRepository(db),
			},
		});
		const cats = await call<Category[]>(maya, "GET", "/categories");
		const found = cats.body.data.find((c) => c.slug === "food");
		if (!found) throw new Error("food category missing");
		food = found;
	});

	afterAll(async () => {
		await app?.close();
		await database.close();
	});

	it("logs spending and lowers today's safe-to-spend by the same amount", async () => {
		const before = await call<Summary>(maya, "GET", "/summary");
		const created = await call<Transaction>(maya, "POST", "/transactions", {
			amountMinor: 1250,
			currency: "MYR",
			categoryId: food.id,
			merchant: "Nasi lemak",
		});
		expect(created.status).toBe(201);
		const after = await call<Summary>(maya, "GET", "/summary");
		expect(after.body.data.safe.safeTodayMinor).toBe(
			before.body.data.safe.safeTodayMinor - 1250,
		);
		expect(after.body.data.today.map((t) => t.merchant)).toContain(
			"Nasi lemak",
		);
	});

	it("converts foreign spending into the home currency", async () => {
		const { body } = await call<Transaction>(maya, "POST", "/transactions", {
			amountMinor: 1000,
			currency: "USD",
			categoryId: food.id,
		});
		expect(body.data.homeCurrency).toBe("MYR");
		expect(body.data.homeAmountMinor).toBe(4085);
	});

	it("explains plainly when a currency has no rate", async () => {
		const res = await call(maya, "POST", "/transactions", {
			amountMinor: 500,
			currency: "BDT",
			categoryId: food.id,
		});
		expect(res.status).toBe(422);
		expect(res.body.error).toMatch(/exchange rate for BDT/);
	});

	it("keeps each person's spending private", async () => {
		const mine = await call<TransactionPage>(
			maya,
			"GET",
			"/transactions?limit=1",
		);
		const target = mine.body.data.items[0];
		expect(target).toBeDefined();
		const edit = await call(sam, "PATCH", `/transactions/${target?.id}`, {
			amountMinor: 1,
		});
		expect(edit.status).toBe(404);
		const samList = await call<TransactionPage>(sam, "GET", "/transactions");
		expect(samList.body.data.items).toHaveLength(0);
	});

	it("pages through history with a cursor", async () => {
		const first = await call<TransactionPage>(
			maya,
			"GET",
			"/transactions?limit=1",
		);
		expect(first.body.data.nextCursor).toBeTruthy();
		const second = await call<TransactionPage>(
			maya,
			"GET",
			`/transactions?limit=1&cursor=${first.body.data.nextCursor}`,
		);
		expect(second.body.data.items[0]?.id).not.toBe(
			first.body.data.items[0]?.id,
		);
	});

	it("lists one day's expenses by the person's own calendar day", async () => {
		const ana = await createPerson(db);
		const at = (iso: string) =>
			call<Transaction>(ana, "POST", "/transactions", {
				amountMinor: 1_000,
				currency: "MYR",
				categoryId: food.id,
				merchant: iso,
				occurredAt: iso,
			});
		// Kuala Lumpur is UTC+8: 16:30 UTC on the 2nd is already the 3rd there.
		await at("2026-09-02T01:00:00.000Z");
		await at("2026-09-02T15:59:00.000Z");
		await at("2026-09-02T16:30:00.000Z");
		await at("2026-09-01T15:30:00.000Z");

		const day = await call<TransactionPage>(
			ana,
			"GET",
			"/transactions?day=2026-09-02",
		);
		expect(day.status).toBe(200);
		expect(day.body.data.items.map((t) => t.merchant).sort()).toEqual([
			"2026-09-02T01:00:00.000Z",
			"2026-09-02T15:59:00.000Z",
		]);
		const bad = await call(ana, "GET", "/transactions?day=2026-9-2");
		expect(bad.status).toBe(400);
	});

	it("says how many there are in all, for 'Showing 30 of 65'", async () => {
		const ben = await createPerson(db);
		for (const merchant of ["One", "Two", "Three"])
			await call(ben, "POST", "/transactions", {
				amountMinor: 500,
				currency: "MYR",
				categoryId: food.id,
				merchant,
			});
		const first = await call<TransactionPage>(
			ben,
			"GET",
			"/transactions?limit=2",
		);
		expect(first.body.data.items).toHaveLength(2);
		expect(first.body.data.total).toBe(3);
		const found = await call<TransactionPage>(
			ben,
			"GET",
			"/transactions?limit=2&q=two",
		);
		expect(found.body.data.total).toBe(1);
	});

	it("deletes softly so Undo can restore", async () => {
		const { body } = await call<Transaction>(sam, "POST", "/transactions", {
			amountMinor: 999,
			currency: "MYR",
			categoryId: food.id,
		});
		await call(sam, "DELETE", `/transactions/${body.data.id}`);
		expect(
			(await call<TransactionPage>(sam, "GET", "/transactions")).body.data
				.items,
		).toHaveLength(0);
		await call(sam, "POST", `/transactions/${body.data.id}/restore`);
		expect(
			(await call<TransactionPage>(sam, "GET", "/transactions")).body.data
				.items,
		).toHaveLength(1);
	});

	it("never lets the admin role reach money", async () => {
		const res = await call(admin, "GET", "/summary");
		expect(res.status).toBe(403);
	});
});
