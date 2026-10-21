import { type Db, receipt, transaction } from "@spendid/db";
import type { FileStore } from "@spendid/server";
import { and, eq, isNotNull, lt } from "drizzle-orm";

export const TIDY_QUEUE = "receipt-tidy";

/** A removed expense keeps its receipt photo this long (well past any Undo), then it's deleted. */
export const PHOTO_GRACE_DAYS = 7;

/** At most this many per run, so one run stays short; the next run takes the rest. */
const BATCH = 500;

/**
 * Deletes, for good, the receipt photos of expenses removed more than PHOTO_GRACE_DAYS ago.
 * The expense itself stays removed (Undo within the grace period still brings its photo back).
 * Returns how many photos were deleted.
 */
export async function purgeRemovedPhotos(
	db: Db,
	store: Pick<FileStore, "remove">,
	now: Date = new Date(),
): Promise<number> {
	const cutoff = new Date(now.getTime() - PHOTO_GRACE_DAYS * 86_400_000);
	const rows = await db
		.select({ id: receipt.id, fileKey: receipt.fileKey })
		.from(receipt)
		.innerJoin(transaction, eq(transaction.id, receipt.transactionId))
		.where(
			and(isNotNull(transaction.deletedAt), lt(transaction.deletedAt, cutoff)),
		)
		.limit(BATCH);
	for (const row of rows) {
		// The file first: if the row can't be deleted, tomorrow's run tries again.
		await store.remove(row.fileKey);
		await db.delete(receipt).where(eq(receipt.id, row.id));
	}
	return rows.length;
}
