import { category, type Db, profile, receipt } from "@spendid/db";
import {
	type AiGuard,
	type FileStore,
	type MerchantMemory,
	type ReceiptReader,
	ServiceError,
	UnreadableAiAnswer,
} from "@spendid/server";
import type { ReceiptDraft, ReceiptEvent } from "@spendid/shared";
import { type Job, UnrecoverableError } from "bullmq";
import { eq } from "drizzle-orm";

export const RECEIPT_QUEUE = "receipts";

interface Deps {
	db: Db;
	store: FileStore;
	guard: AiGuard;
	read: ReceiptReader;
	publish: (userId: string, event: ReceiptEvent) => Promise<unknown>;
	merchants: MerchantMemory;
}

/** Reads one receipt photo with ILMU vision and tells the person's open apps it's ready. */
export function createReceiptProcessor({
	db,
	store,
	guard,
	read,
	publish,
	merchants,
}: Deps) {
	/** The person's own name for this shop and the category they use for it. */
	async function learned(
		userId: string,
		draft: ReceiptDraft,
	): Promise<ReceiptDraft> {
		const known = await merchants.find(userId, draft.merchant);
		if (!known)
			return {
				...draft,
				merchant: await merchants.displayName(userId, draft.merchant),
			};
		const [cat] = known.categoryId
			? await db
					.select({ slug: category.slug })
					.from(category)
					.where(eq(category.id, known.categoryId))
					.limit(1)
			: [];
		return {
			...draft,
			merchant: known.name,
			categorySlug: cat?.slug ?? draft.categorySlug,
		};
	}

	async function fail(
		id: string,
		userId: string,
		message: string,
	): Promise<void> {
		await db
			.update(receipt)
			.set({ status: "failed", error: message })
			.where(eq(receipt.id, id));
		await publish(userId, { type: "receipt", id, status: "failed" });
	}

	return async (job: Job<{ receiptId: string }>): Promise<void> => {
		const [row] = await db
			.select()
			.from(receipt)
			.where(eq(receipt.id, job.data.receiptId))
			.limit(1);
		if (row?.status !== "reading") return;

		const [p] = await db
			.select({ home: profile.homeCurrency })
			.from(profile)
			.where(eq(profile.userId, row.userId))
			.limit(1);
		try {
			await guard.assertAllowed(row.userId);
			const reading = await read(
				await store.get(row.fileKey),
				row.mime,
				p?.home ?? "MYR",
			);
			await guard.record(row.userId, {
				feature: "receipt-read",
				model: reading.model,
				inputTokens: reading.inputTokens,
				outputTokens: reading.outputTokens,
			});
			await db
				.update(receipt)
				.set({
					status: "ready",
					draft: await learned(row.userId, reading.draft),
					error: null,
				})
				.where(eq(receipt.id, row.id));
			await publish(row.userId, {
				type: "receipt",
				id: row.id,
				status: "ready",
			});
		} catch (error) {
			// An answer that didn't fit: the tokens were spent, and the same photo won't read better.
			if (error instanceof UnreadableAiAnswer) {
				await guard.record(row.userId, {
					feature: "receipt-read",
					...error.usage,
				});
				const message =
					"We couldn't read this receipt. Fill in the details yourself, or try another photo.";
				await fail(row.id, row.userId, message);
				throw new UnrecoverableError(message);
			}
			// Allowance or switched-off AI: retrying won't help, say so plainly.
			if (error instanceof ServiceError) {
				await fail(row.id, row.userId, error.message);
				throw new UnrecoverableError(error.message);
			}
			const lastTry = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
			if (lastTry)
				await fail(
					row.id,
					row.userId,
					"We couldn't read this receipt. Fill in the details yourself, or try another photo.",
				);
			throw error;
		}
	};
}
