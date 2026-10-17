import { type Db, merchant, transaction } from "@spendid/db";
import { cleanMerchant, merchantKey } from "@spendid/shared";
import {
	and,
	cosineDistance,
	desc,
	eq,
	ilike,
	isNotNull,
	ne,
	or,
	sql,
} from "drizzle-orm";
import type { Embedder } from "./ai/embed";
import type { AiGuard } from "./ai/guard";

/**
 * Below this cosine distance two shop keys are the same shop. Measured on bge-m3 with
 * lower-case keys: variants 0.01–0.16 ("unifi" / "unifi internet" 0.145), different
 * shops 0.2+ ("sushi lunch" / "thai lunch" 0.22). Casing skews distances, so keys are embedded.
 */
export const SAME_SHOP_DISTANCE = 0.17;

export interface KnownMerchant {
	id: string;
	name: string;
	categoryId: string | null;
	uses: number;
	embedded: boolean;
}

const columns = {
	id: merchant.id,
	name: merchant.name,
	categoryId: merchant.categoryId,
	uses: merchant.uses,
	embedded: sql<boolean>`${merchant.embedding} is not null`,
};

/**
 * What Spendid remembers about each shop someone uses: its clean name and the category
 * they chose last (smart categories). Scoped by user on every query.
 */
export function createMerchantMemory(db: Db) {
	return {
		async find(userId: string, raw: string): Promise<KnownMerchant | null> {
			const key = merchantKey(raw);
			if (!key) return null;
			const [row] = await db
				.select(columns)
				.from(merchant)
				.where(and(eq(merchant.userId, userId), eq(merchant.key, key)))
				.limit(1);
			return row ?? null;
		},

		/** The name to store for a typed or read merchant: a known shop's name, else a cleaned one. */
		async displayName(userId: string, raw: string): Promise<string> {
			return (await this.find(userId, raw))?.name ?? cleanMerchant(raw);
		},

		/** Learns from a saved expense: this shop belongs in this category (latest choice wins). */
		async remember(
			userId: string,
			raw: string,
			categoryId: string,
			uses = 1,
		): Promise<{ row: KnownMerchant; created: boolean } | null> {
			const key = merchantKey(raw);
			if (!key) return null;
			const [row] = await db
				.insert(merchant)
				.values({
					userId,
					key,
					name: cleanMerchant(raw),
					categoryId,
					uses: Math.max(1, uses),
				})
				.onConflictDoUpdate({
					target: [merchant.userId, merchant.key],
					set: { categoryId, uses: sql`${merchant.uses} + ${uses}` },
				})
				.returning({ ...columns, inserted: sql<boolean>`xmax = 0` });
			if (!row) return null;
			const { inserted, ...known } = row;
			return { row: known, created: inserted };
		},

		/** Shops starting with (or containing) what's typed, most used first. */
		async suggest(
			userId: string,
			q: string,
			limit = 8,
		): Promise<KnownMerchant[]> {
			const key = merchantKey(q);
			if (!key) return [];
			const rows = await db
				.select(columns)
				.from(merchant)
				.where(
					and(
						eq(merchant.userId, userId),
						or(
							ilike(merchant.key, `${key}%`),
							ilike(merchant.name, `%${q.trim()}%`),
						),
					),
				)
				.orderBy(desc(merchant.uses))
				.limit(limit * 2);
			// Aliases share their main shop's name: show each name once.
			const seen = new Set<string>();
			return rows
				.filter((r) => !seen.has(r.name) && seen.add(r.name))
				.slice(0, limit);
		},
	};
}

export type MerchantMemory = ReturnType<typeof createMerchantMemory>;

/**
 * Background step for a new shop name: embed it and, when it's a variant of a shop the
 * person already has ("TEALIVE KLCC" vs "Tealive"), merge it into that one — the alias
 * keeps its key, takes the main name, and past expenses are renamed.
 */
export function createMerchantMatcher(deps: {
	db: Db;
	embed: Embedder;
	guard: AiGuard;
}) {
	const { db } = deps;
	return async (merchantId: string): Promise<"merged" | "kept" | "skipped"> => {
		const [row] = await db
			.select()
			.from(merchant)
			.where(eq(merchant.id, merchantId))
			.limit(1);
		if (!row || row.embedding) return "skipped";
		// Background work skips the per-minute burst limit (that's for taps), not the allowance.
		const ai = await deps.guard.status(row.userId);
		if (!ai.enabled || ai.usedTokens >= ai.limitTokens) return "skipped";
		const { vectors, tokens, model } = await deps.embed([row.key]);
		const vector = vectors[0];
		if (!vector) return "skipped";
		await deps.guard.record(row.userId, {
			feature: "merchant-match",
			model,
			inputTokens: tokens,
		});

		const distance = cosineDistance(merchant.embedding, vector);
		const [nearest] = await db
			.select({
				id: merchant.id,
				name: merchant.name,
				categoryId: merchant.categoryId,
				distance,
			})
			.from(merchant)
			.where(
				and(
					eq(merchant.userId, row.userId),
					ne(merchant.id, row.id),
					isNotNull(merchant.embedding),
				),
			)
			.orderBy(distance)
			.limit(1);

		const same =
			nearest &&
			Number(nearest.distance) < SAME_SHOP_DISTANCE &&
			nearest.name !== row.name;
		await db.transaction(async (tx) => {
			await tx
				.update(merchant)
				.set({
					embedding: vector,
					...(same && {
						name: nearest.name,
						categoryId: row.categoryId ?? nearest.categoryId,
					}),
				})
				.where(eq(merchant.id, row.id));
			if (same)
				await tx
					.update(transaction)
					.set({ merchant: nearest.name })
					.where(
						and(
							eq(transaction.userId, row.userId),
							eq(transaction.merchant, row.name),
						),
					);
		});
		return same ? "merged" : "kept";
	};
}

export const MERCHANT_QUEUE = "merchants";
