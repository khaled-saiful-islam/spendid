import { type Db, profile, transaction } from "@spendid/db";
import type { Transaction, TransactionPage } from "@spendid/shared";
import {
	and,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { onLocalDays } from "./local-days";

type Row = typeof transaction.$inferSelect;
export type NewTransaction = Omit<
	typeof transaction.$inferInsert,
	"id" | "createdAt" | "updatedAt" | "deletedAt"
>;

export interface ListOptions {
	limit: number;
	cursor?: string;
	categoryId?: string;
	search?: string;
	/** Only this calendar day ("YYYY-MM-DD") in the person's own time zone. */
	day?: string;
}

export function toDto(r: Row): Transaction {
	return {
		id: r.id,
		amountMinor: r.amountMinor,
		currency: r.currency,
		homeAmountMinor: r.homeAmountMinor,
		homeCurrency: r.homeCurrency,
		fxRate: Number(r.fxRate),
		categoryId: r.categoryId,
		merchant: r.merchant,
		note: r.note,
		source: r.source,
		occurredAt: r.occurredAt.toISOString(),
	};
}

/** Cursor = "<occurredAt ISO>|<id>" in base64url; stable under ties. */
function encodeCursor(r: Row): string {
	return Buffer.from(`${r.occurredAt.toISOString()}|${r.id}`).toString(
		"base64url",
	);
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
	const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
	const date = at ? new Date(at) : null;
	return date && !Number.isNaN(date.getTime()) && id ? { at: date, id } : null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Every query is scoped by user id: a person can only ever touch their own rows. */
export function createTransactionRepository(db: Db) {
	const owned = (userId: string, id: string) =>
		and(eq(transaction.userId, userId), eq(transaction.id, id));

	return {
		async insert(row: NewTransaction): Promise<Transaction> {
			const [created] = await db.insert(transaction).values(row).returning();
			if (!created) throw new Error("insert returned nothing");
			return toDto(created);
		},

		async findOwned(userId: string, id: string): Promise<Row | null> {
			const [row] = await db
				.select()
				.from(transaction)
				.where(owned(userId, id))
				.limit(1);
			return row ?? null;
		},

		async update(
			userId: string,
			id: string,
			patch: Partial<NewTransaction>,
		): Promise<Transaction | null> {
			const [row] = await db
				.update(transaction)
				.set(patch)
				.where(and(owned(userId, id), isNull(transaction.deletedAt)))
				.returning();
			return row ? toDto(row) : null;
		},

		/** Soft delete / restore, so the UI can offer Undo. */
		async setDeleted(
			userId: string,
			id: string,
			deleted: boolean,
		): Promise<Transaction | null> {
			const [row] = await db
				.update(transaction)
				.set({ deletedAt: deleted ? new Date() : null })
				.where(
					and(
						owned(userId, id),
						deleted
							? isNull(transaction.deletedAt)
							: isNotNull(transaction.deletedAt),
					),
				)
				.returning();
			return row ? toDto(row) : null;
		},

		async list(userId: string, opts: ListOptions): Promise<TransactionPage> {
			const filters: (SQL | undefined)[] = [
				eq(transaction.userId, userId),
				isNull(transaction.deletedAt),
			];
			if (opts.categoryId)
				filters.push(eq(transaction.categoryId, opts.categoryId));
			if (opts.day) {
				const [p] = await db
					.select({ timeZone: profile.timeZone })
					.from(profile)
					.where(eq(profile.userId, userId))
					.limit(1);
				filters.push(
					onLocalDays(
						transaction.occurredAt,
						p?.timeZone ?? "UTC",
						opts.day,
						sql`(${opts.day}::date + 1)`,
					),
				);
			}
			if (opts.search) {
				const term = `%${escapeLike(opts.search)}%`;
				filters.push(
					or(ilike(transaction.merchant, term), ilike(transaction.note, term)),
				);
			}
			// Counted before the cursor narrows the list: the same number on every page.
			const [counted] = await db
				.select({ total: sql<number>`count(*)::int` })
				.from(transaction)
				.where(and(...filters));
			const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
			if (cursor) {
				filters.push(
					or(
						lt(transaction.occurredAt, cursor.at),
						and(
							eq(transaction.occurredAt, cursor.at),
							lt(transaction.id, sql`${cursor.id}::uuid`),
						),
					),
				);
			}
			const rows = await db
				.select()
				.from(transaction)
				.where(and(...filters))
				.orderBy(desc(transaction.occurredAt), desc(transaction.id))
				.limit(opts.limit + 1);
			const page = rows.slice(0, opts.limit);
			const last = page.at(-1);
			return {
				items: page.map(toDto),
				nextCursor:
					rows.length > opts.limit && last ? encodeCursor(last) : null,
				total: counted?.total ?? page.length,
			};
		},
	};
}

export type TransactionRepository = ReturnType<
	typeof createTransactionRepository
>;
