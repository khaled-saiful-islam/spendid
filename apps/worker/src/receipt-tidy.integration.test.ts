import { createDb, receipt, transaction } from "@spendid/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCategories } from "../../api/src/scripts/categories";
import { createPerson, testDbUrl } from "../../api/test/db";
import { purgeRemovedPhotos } from "./receipt-tidy";

const url = testDbUrl();
const DAY = 86_400_000;

describe.skipIf(!url)("receipt photo tidy (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	let me: string;
	let categoryId: string;

	beforeAll(async () => {
		await seedCategories(db);
		me = await createPerson(db);
		const [row] = await db.query.category.findMany({ limit: 1 });
		categoryId = row?.id ?? "";
	});
	afterAll(() => database.close());

	/** An expense with a saved receipt; removed `removedDaysAgo` days ago, or not at all. */
	async function expenseWithPhoto(removedDaysAgo: number | null, now: Date) {
		const [tx] = await db
			.insert(transaction)
			.values({
				userId: me,
				categoryId,
				merchant: "Shop",
				amountMinor: 1000,
				currency: "MYR",
				homeAmountMinor: 1000,
				homeCurrency: "MYR",
				occurredAt: now,
				deletedAt:
					removedDaysAgo === null
						? null
						: new Date(now.getTime() - removedDaysAgo * DAY),
			})
			.returning({ id: transaction.id });
		const fileKey = `${me}/${crypto.randomUUID()}.bin`;
		const [r] = await db
			.insert(receipt)
			.values({
				userId: me,
				status: "saved",
				fileKey,
				mime: "image/jpeg",
				bytes: 1000,
				transactionId: tx?.id,
			})
			.returning({ id: receipt.id });
		return { receiptId: r?.id ?? "", fileKey };
	}

	const exists = async (id: string) =>
		(await db.select().from(receipt).where(eq(receipt.id, id))).length === 1;

	it("deletes photos of expenses removed over a week ago, and only those", async () => {
		const now = new Date();
		const old = await expenseWithPhoto(8, now);
		const recent = await expenseWithPhoto(2, now);
		const kept = await expenseWithPhoto(null, now);
		const removedFiles: string[] = [];
		const store = {
			remove: async (key: string) => void removedFiles.push(key),
		};

		await purgeRemovedPhotos(db, store, now);

		expect(removedFiles).toContain(old.fileKey);
		expect(removedFiles).not.toContain(recent.fileKey);
		expect(removedFiles).not.toContain(kept.fileKey);
		expect(await exists(old.receiptId)).toBe(false);
		expect(await exists(recent.receiptId)).toBe(true);
		expect(await exists(kept.receiptId)).toBe(true);
		// The removed expense itself stays (removed), only its photo goes.
		const [tx] = await db
			.select({ deletedAt: transaction.deletedAt })
			.from(transaction)
			.innerJoin(receipt, eq(receipt.transactionId, transaction.id))
			.where(eq(receipt.id, recent.receiptId));
		expect(tx?.deletedAt).not.toBeNull();
	});

	it("keeps the photo of an expense restored with Undo", async () => {
		const now = new Date();
		const undone = await expenseWithPhoto(null, now);
		const removedFiles: string[] = [];
		await purgeRemovedPhotos(
			db,
			{ remove: async (k) => void removedFiles.push(k) },
			new Date(now.getTime() + 30 * DAY),
		);
		expect(removedFiles).not.toContain(undone.fileKey);
		expect(await exists(undone.receiptId)).toBe(true);
	});
});
