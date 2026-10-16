import { type Db, merchant, transaction } from "@spendid/db";
import type { MerchantMemory } from "@spendid/server";
import type { Queue } from "bullmq";
import { and, desc, isNotNull, isNull, notExists, sql } from "drizzle-orm";

export interface MerchantJob {
	merchantId: string;
}

/**
 * One-off for people who logged spending before Spendid remembered shops: learn every shop
 * from their history (latest category wins), then match names in the background.
 * Idempotent: only people without any remembered shops are touched. Also re-queues shops
 * that were never matched.
 */
export async function backfillMerchants(
	db: Db,
	memory: MerchantMemory,
	queue: Queue<MerchantJob>,
): Promise<number> {
	const rows = await db
		.select({
			userId: transaction.userId,
			merchant: transaction.merchant,
			categoryId: sql<string>`(array_agg(${transaction.categoryId} order by ${transaction.occurredAt} desc))[1]`,
			uses: sql<number>`count(*)::int`,
		})
		.from(transaction)
		.where(
			and(
				isNotNull(transaction.merchant),
				isNull(transaction.deletedAt),
				notExists(
					db
						.select({ one: sql`1` })
						.from(merchant)
						.where(sql`${merchant.userId} = ${transaction.userId}`),
				),
			),
		)
		.groupBy(transaction.userId, transaction.merchant)
		.orderBy(desc(sql`count(*)`));
	let learned = 0;
	for (const r of rows) {
		if (!r.merchant) continue;
		const result = await memory.remember(
			r.userId,
			r.merchant,
			r.categoryId,
			r.uses,
		);
		if (result?.created) {
			learned += 1;
			await queue.add(
				"match",
				{ merchantId: result.row.id },
				{ removeOnComplete: 500, attempts: 3 },
			);
		}
	}
	// Shops whose matching was skipped earlier (AI off, allowance used): try again.
	const unmatched = await db
		.select({ id: merchant.id })
		.from(merchant)
		.where(isNull(merchant.embedding))
		.limit(500);
	for (const m of unmatched)
		await queue.add(
			"match",
			{ merchantId: m.id },
			{ removeOnComplete: 500, attempts: 3 },
		);
	return learned;
}
