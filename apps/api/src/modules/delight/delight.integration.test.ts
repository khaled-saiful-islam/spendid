import { category, createDb, transaction, wish } from "@spendid/db";
import type { Wish, WishList } from "@spendid/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { buildApp } from "../../app";
import type { SessionLookup } from "../../auth/guards";
import { seedCategories } from "../../scripts/categories";
import { createDelightService } from "./delight.service";

const url = testDbUrl();
const DAY = 86_400_000;

describe.skipIf(!url)("impulse pause (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	let app: FastifyInstance;
	let maya: string;
	let sam: string;

	const session: SessionLookup = async (headers) => {
		const id = headers.get("x-test-user");
		return id
			? {
					id,
					name: "T",
					email: "t@test.local",
					emailVerified: true,
					role: "user",
				}
			: null;
	};
	const call = async <T>(
		userId: string,
		method: "GET" | "POST" | "DELETE",
		path: string,
		payload?: object,
	) => {
		const res = await app.inject({
			method,
			url: `/api${path}`,
			headers: { "x-test-user": userId },
			payload,
		});
		return { status: res.statusCode, body: res.json() as { data: T } };
	};

	beforeAll(async () => {
		await seedCategories(db);
		maya = await createPerson(db, { incomeMinor: 600_000 });
		sam = await createPerson(db);
		const [cat] = await db
			.select({ id: category.id })
			.from(category)
			.where(eq(category.slug, "food"))
			.limit(1);
		for (const daysAgo of [1, 2])
			await db.insert(transaction).values({
				userId: maya,
				amountMinor: 500,
				currency: "MYR",
				homeAmountMinor: 500,
				homeCurrency: "MYR",
				categoryId: cat?.id ?? "",
				occurredAt: new Date(Date.now() - daysAgo * DAY),
			});
		app = await buildApp({
			checks: { database: database.ping, redis: async () => true },
			delight: { session, delight: createDelightService(db) },
		});
	});
	afterAll(async () => {
		await app?.close();
		await database.close();
	});

	it("waits 48 hours, shows hours of work, and counts what skipping saved", async () => {
		const added = await call<Wish>(maya, "POST", "/wishes", {
			name: "Air fryer",
			priceMinor: 34_667,
			currency: "MYR",
		});
		expect(added.status).toBe(201);
		expect(added.body.data.hoursOfWork).toBe(10);
		expect(
			new Date(added.body.data.coolUntil).getTime() - Date.now(),
		).toBeGreaterThan(47 * 3_600_000);

		const other = await call(
			sam,
			"POST",
			`/wishes/${added.body.data.id}/decide`,
			{ decision: "skipped" },
		);
		expect(other.status).toBe(404);
		await call(maya, "POST", `/wishes/${added.body.data.id}/decide`, {
			decision: "skipped",
		});
		const twice = await call(
			maya,
			"POST",
			`/wishes/${added.body.data.id}/decide`,
			{ decision: "bought" },
		);
		expect(twice.status).toBe(404);

		const list = await call<WishList>(maya, "GET", "/wishes");
		expect(list.body.data).toMatchObject({ waiting: [], savedMinor: 34_667 });
		expect(list.body.data.decided[0]).toMatchObject({
			name: "Air fryer",
			decision: "skipped",
		});
		const samList = await call<WishList>(sam, "GET", "/wishes");
		expect(samList.body.data.decided).toHaveLength(0);
		await db.delete(wish).where(eq(wish.userId, maya));
	});
});
