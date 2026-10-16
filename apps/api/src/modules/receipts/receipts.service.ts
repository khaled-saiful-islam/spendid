import { type Db, receipt, transactionItem, warranty } from "@spendid/db";
import type { FileStore } from "@spendid/server";
import {
	itemKey,
	type PriceMemory,
	priceChange,
	type Receipt,
	type ReceiptDraft,
	ReceiptDraftSchema,
	type ReceiptSave,
	ReceiptSaveSchema,
	type Transaction,
} from "@spendid/shared";
import type { Queue } from "bullmq";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { AppError, badRequest, notFound } from "../../http/app-error";
import type { TransactionService } from "../money/transactions.service";

export const RECEIPT_QUEUE = "receipts";
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

type Row = typeof receipt.$inferSelect;

/** Sniffs the real file type from its first bytes — never trust the Content-Type header alone. */
export function sniffImage(
	bytes: Buffer,
): "image/jpeg" | "image/png" | "image/webp" | null {
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
		return "image/jpeg";
	if (
		bytes
			.subarray(0, 8)
			.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	)
		return "image/png";
	if (
		bytes.subarray(0, 4).toString() === "RIFF" &&
		bytes.subarray(8, 12).toString() === "WEBP"
	)
		return "image/webp";
	return null;
}

function addMonths(isoDate: string, months: number): string {
	const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
	const end = new Date(Date.UTC(y, m - 1 + months, d));
	return end.toISOString().slice(0, 10);
}

interface Deps {
	db: Db;
	store: FileStore;
	queue: Queue<{ receiptId: string }>;
	transactions: TransactionService;
}

/** Photo → encrypted file → background read → reviewed draft → expense with items and warranties. */
export function createReceiptService({ db, store, queue, transactions }: Deps) {
	const owned = (userId: string, id: string) =>
		and(eq(receipt.userId, userId), eq(receipt.id, id));

	async function priceMemoryFor(
		userId: string,
		draft: ReceiptDraft,
		excludeTransactionId: string | null,
	): Promise<PriceMemory[]> {
		const byKey = new Map(draft.items.map((i) => [itemKey(i.name), i]));
		if (byKey.size === 0) return [];
		const previous = await db
			.selectDistinctOn([transactionItem.itemKey], {
				itemKey: transactionItem.itemKey,
				unitPriceMinor: transactionItem.unitPriceMinor,
				boughtAt: transactionItem.boughtAt,
			})
			.from(transactionItem)
			.where(
				and(
					eq(transactionItem.userId, userId),
					eq(transactionItem.currency, draft.currency),
					inArray(transactionItem.itemKey, [...byKey.keys()]),
					excludeTransactionId
						? ne(transactionItem.transactionId, excludeTransactionId)
						: undefined,
				),
			)
			.orderBy(transactionItem.itemKey, desc(transactionItem.boughtAt));
		return previous.flatMap((p) => {
			const item = byKey.get(p.itemKey);
			const changePct = item
				? priceChange(p.unitPriceMinor, item.unitPriceMinor)
				: null;
			return item && changePct !== null && changePct !== 0
				? [
						{
							itemName: item.name,
							previousUnitMinor: p.unitPriceMinor,
							previousAt: p.boughtAt.toISOString(),
							changePct,
						},
					]
				: [];
		});
	}

	async function toDto(row: Row, withMemory: boolean): Promise<Receipt> {
		const parsed = row.draft ? ReceiptDraftSchema.safeParse(row.draft) : null;
		const draft = parsed?.success ? parsed.data : null;
		return {
			id: row.id,
			status: row.status,
			createdAt: row.createdAt.toISOString(),
			error: row.error,
			draft,
			priceMemory:
				withMemory && draft
					? await priceMemoryFor(row.userId, draft, row.transactionId)
					: [],
			transactionId: row.transactionId,
		};
	}

	async function findOwned(userId: string, id: string): Promise<Row> {
		const [row] = await db
			.select()
			.from(receipt)
			.where(owned(userId, id))
			.limit(1);
		if (!row) throw notFound("Receipt");
		return row;
	}

	return {
		async upload(userId: string, bytes: Buffer): Promise<Receipt> {
			if (bytes.byteLength > MAX_RECEIPT_BYTES)
				throw new AppError(
					413,
					"That photo is too large. Try again — Spendid shrinks it for you.",
				);
			const mime = sniffImage(bytes);
			if (!mime)
				throw badRequest(
					"That file isn't a photo Spendid can read. Use a JPEG, PNG or WebP image.",
				);
			const fileKey = await store.put(userId, bytes);
			const [row] = await db
				.insert(receipt)
				.values({ userId, fileKey, mime, bytes: bytes.byteLength })
				.returning();
			if (!row) throw new Error("receipt insert returned nothing");
			await queue.add(
				"read",
				{ receiptId: row.id },
				{
					attempts: 3,
					backoff: { type: "exponential", delay: 4_000 },
					removeOnComplete: 500,
				},
			);
			return toDto(row, false);
		},

		/** Receipts still being read or waiting for review, newest first. */
		async pending(userId: string): Promise<Receipt[]> {
			const rows = await db
				.select()
				.from(receipt)
				.where(
					and(
						eq(receipt.userId, userId),
						inArray(receipt.status, ["reading", "ready", "failed"]),
					),
				)
				.orderBy(desc(receipt.createdAt))
				.limit(20);
			return Promise.all(rows.map((r) => toDto(r, false)));
		},

		async get(userId: string, id: string): Promise<Receipt> {
			return toDto(await findOwned(userId, id), true);
		},

		async image(
			userId: string,
			id: string,
		): Promise<{ bytes: Buffer; mime: string }> {
			const row = await findOwned(userId, id);
			return { bytes: await store.get(row.fileKey), mime: row.mime };
		},

		async save(
			userId: string,
			id: string,
			raw: ReceiptSave,
		): Promise<Transaction> {
			const input = ReceiptSaveSchema.parse(raw);
			const row = await findOwned(userId, id);
			if (row.status === "saved")
				throw new AppError(409, "This receipt is already saved.");
			if (row.status === "reading")
				throw new AppError(
					409,
					"Still reading this receipt. Give it a moment.",
				);

			const created = await transactions.create(userId, {
				amountMinor: input.totalMinor,
				currency: input.currency,
				categoryId: input.categoryId,
				merchant: input.merchant,
				occurredAt: input.occurredAt,
				source: "photo",
			});
			try {
				const boughtAt = new Date(input.occurredAt);
				const purchasedOn = input.occurredAt.slice(0, 10);
				await db.transaction(async (tx) => {
					if (input.items.length) {
						await tx.insert(transactionItem).values(
							input.items.map((i) => ({
								userId,
								transactionId: created.id,
								name: i.name,
								itemKey: itemKey(i.name),
								quantity: String(i.quantity),
								unitPriceMinor: i.unitPriceMinor,
								totalMinor: i.totalMinor,
								currency: input.currency,
								boughtAt,
							})),
						);
					}
					if (input.warranties.length) {
						await tx.insert(warranty).values(
							input.warranties.map((w) => ({
								userId,
								transactionId: created.id,
								itemName: w.itemName,
								purchasedOn,
								months: w.months,
								endsOn: addMonths(purchasedOn, w.months),
							})),
						);
					}
					await tx
						.update(receipt)
						.set({ status: "saved", transactionId: created.id })
						.where(owned(userId, id));
				});
			} catch (error) {
				// Keep it all-or-nothing from the person's point of view.
				await transactions.remove(userId, created.id);
				throw error;
			}
			return created;
		},

		async discard(userId: string, id: string): Promise<void> {
			const row = await findOwned(userId, id);
			if (row.status === "saved")
				throw new AppError(409, "Saved receipts stay with their expense.");
			await db.delete(receipt).where(owned(userId, id));
			await store.remove(row.fileKey);
		},

		async warranties(userId: string) {
			return db
				.select({
					id: warranty.id,
					itemName: warranty.itemName,
					purchasedOn: warranty.purchasedOn,
					endsOn: warranty.endsOn,
					months: warranty.months,
					transactionId: warranty.transactionId,
				})
				.from(warranty)
				.where(eq(warranty.userId, userId))
				.orderBy(warranty.endsOn);
		},
	};
}

export type ReceiptService = ReturnType<typeof createReceiptService>;
