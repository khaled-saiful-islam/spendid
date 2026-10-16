import { createDb, receipt } from "@spendid/db";
import type { EventHub, FileStore } from "@spendid/server";
import type {
	Category,
	PriceMemory,
	Receipt,
	ReceiptDraft,
	Transaction,
} from "@spendid/shared";
import type { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { buildApp } from "../../app";
import type { SessionLookup } from "../../auth/guards";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "../money/categories.repository";
import { createFxRepository } from "../money/fx.repository";
import { createTransactionRepository } from "../money/transactions.repository";
import { createTransactionService } from "../money/transactions.service";
import { createReceiptService } from "./receipts.service";

const url = testDbUrl();
const JPEG = Buffer.concat([
	Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
	Buffer.alloc(64),
]);

function memoryStore(): FileStore {
	const files = new Map<string, Buffer>();
	let n = 0;
	return {
		put: async (_owner, bytes) => {
			const key = `k${n++}`;
			files.set(key, bytes);
			return key;
		},
		get: async (key) => files.get(key) ?? Buffer.alloc(0),
		remove: async (key) => void files.delete(key),
	};
}

describe.skipIf(!url)("receipts API (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 4);
	const db = database.db;
	let app: FastifyInstance;
	let maya: string;
	let sam: string;
	let groceries: Category;
	const queued: string[] = [];

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
		payload?: object | Buffer,
	) => {
		const res = await app.inject({
			method,
			url: `/api${path}`,
			headers: {
				"x-test-user": userId,
				...(Buffer.isBuffer(payload) ? { "content-type": "image/jpeg" } : {}),
			},
			payload,
		});
		return {
			status: res.statusCode,
			body: res.json() as { success: boolean; data: T; error?: string },
		};
	};

	/** Stands in for the worker: marks a receipt as read with this draft. */
	const markRead = (id: string, draft: ReceiptDraft) =>
		db
			.update(receipt)
			.set({ status: "ready", draft })
			.where(eq(receipt.id, id));

	const draft = (milkUnit: number): ReceiptDraft => ({
		merchant: "Jaya Grocer",
		date: "2026-10-16",
		currency: "MYR",
		totalMinor: milkUnit * 2 + 8900,
		taxMinor: null,
		categorySlug: "groceries",
		items: [
			{
				name: "Milk Fresh 1L",
				quantity: 2,
				unitPriceMinor: milkUnit,
				totalMinor: milkUnit * 2,
				warrantyMonths: null,
			},
			{
				name: "Power Bank",
				quantity: 1,
				unitPriceMinor: 8900,
				totalMinor: 8900,
				warrantyMonths: 12,
			},
		],
	});

	const saveBody = (d: ReceiptDraft, occurredAt: string) => ({
		merchant: d.merchant,
		categoryId: groceries.id,
		currency: d.currency,
		totalMinor: d.totalMinor,
		occurredAt,
		items: d.items.map(({ warrantyMonths: _w, ...i }) => i),
		warranties: [{ itemName: "Power Bank", months: 12 }],
	});

	beforeAll(async () => {
		await seedCategories(db);
		maya = await createPerson(db);
		sam = await createPerson(db);
		const categories = createCategoryRepository(db);
		const transactions = createTransactionRepository(db);
		const service = createTransactionService({
			db,
			transactions,
			categories,
			fx: createFxRepository(db),
		});
		const queue = {
			add: async (_n: string, data: { receiptId: string }) =>
				queued.push(data.receiptId),
		} as unknown as Queue<{ receiptId: string }>;
		const events = {
			subscribe: () => () => {},
			close: async () => {},
		} as unknown as EventHub;
		app = await buildApp({
			checks: { database: database.ping, redis: async () => true },
			receipts: {
				session,
				events,
				receipts: createReceiptService({
					db,
					store: memoryStore(),
					queue,
					transactions: service,
				}),
			},
		});
		groceries = (await categories.listFor(maya)).find(
			(c) => c.slug === "groceries",
		) as Category;
	});

	afterAll(async () => {
		await app?.close();
		await database.close();
	});

	it("accepts a photo and queues it for reading", async () => {
		const res = await call<Receipt>(maya, "POST", "/capture/receipt", JPEG);
		expect(res.status).toBe(202);
		expect(res.body.data.status).toBe("reading");
		expect(queued).toContain(res.body.data.id);
	});

	it("refuses files that aren't images, whatever the header says", async () => {
		const res = await call(
			maya,
			"POST",
			"/capture/receipt",
			Buffer.from("definitely not a jpeg at all"),
		);
		expect(res.status).toBe(400);
	});

	it("saves a read receipt as an expense with items and a warranty, then remembers prices", async () => {
		const first = await call<Receipt>(maya, "POST", "/capture/receipt", JPEG);
		await markRead(first.body.data.id, draft(690));
		const saved = await call<Transaction>(
			maya,
			"POST",
			`/receipts/${first.body.data.id}/save`,
			saveBody(draft(690), "2026-10-02T10:00:00+08:00"),
		);
		expect(saved.status).toBe(201);
		expect(saved.body.data.source).toBe("photo");

		const second = await call<Receipt>(maya, "POST", "/capture/receipt", JPEG);
		await markRead(second.body.data.id, draft(720));
		const read = await call<Receipt>(
			maya,
			"GET",
			`/receipts/${second.body.data.id}`,
		);
		const milk = read.body.data.priceMemory.find(
			(p: PriceMemory) => p.itemName === "Milk Fresh 1L",
		);
		expect(milk).toMatchObject({ previousUnitMinor: 690, changePct: 4 });

		const warranties = await call<{ itemName: string; endsOn: string }[]>(
			maya,
			"GET",
			"/warranties",
		);
		expect(warranties.body.data).toContainEqual(
			expect.objectContaining({ itemName: "Power Bank", endsOn: "2027-10-02" }),
		);
	});

	it("keeps receipts private to their owner", async () => {
		const mine = await call<Receipt>(maya, "POST", "/capture/receipt", JPEG);
		expect(
			(await call(sam, "GET", `/receipts/${mine.body.data.id}`)).status,
		).toBe(404);
		expect(
			(await call(sam, "GET", `/receipts/${mine.body.data.id}/image`)).status,
		).toBe(404);
	});

	it("discards an unsaved receipt", async () => {
		const r = await call<Receipt>(maya, "POST", "/capture/receipt", JPEG);
		await call(maya, "DELETE", `/receipts/${r.body.data.id}`);
		expect(
			(await call(maya, "GET", `/receipts/${r.body.data.id}`)).status,
		).toBe(404);
	});
});
