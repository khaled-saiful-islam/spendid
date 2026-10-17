import {
	category,
	type Db,
	profile,
	receipt,
	transaction,
	user,
} from "@spendid/db";
import {
	levelIncludes,
	type SharedView,
	type ShareState,
} from "@spendid/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { onLocalDays } from "../money/local-days";
import { monthBounds } from "../money/summary.service";

const RECENT_EXPENSES = 30;

/**
 * Builds exactly what `grant` allows of `ownerId`'s money. The viewer's screen and the
 * owner's "what they see" preview both call this, so they can never drift apart.
 * Notes are never included at any level.
 */
export async function buildSharedView(
	db: Db,
	ownerId: string,
	grant: ShareState,
): Promise<SharedView> {
	const [owner] = await db
		.select({
			name: user.name,
			currency: profile.homeCurrency,
			timeZone: profile.timeZone,
		})
		.from(user)
		.leftJoin(profile, eq(profile.userId, user.id))
		.where(eq(user.id, ownerId))
		.limit(1);
	const base: SharedView = {
		ownerName: owner?.name ?? "Someone",
		currency: owner?.currency ?? "MYR",
		level: grant.level,
		paused: grant.paused,
		month: null,
		categories: null,
		expenses: null,
	};
	if (grant.paused || !owner) return base;

	const timeZone = owner.timeZone ?? "UTC";
	const bounds = await monthBounds(db, timeZone);
	const live = and(
		eq(transaction.userId, ownerId),
		isNull(transaction.deletedAt),
	);
	const thisMonth = and(
		live,
		onLocalDays(
			transaction.occurredAt,
			timeZone,
			bounds.monthStart,
			bounds.nextMonth,
		),
	);
	const lastMonth = and(
		live,
		onLocalDays(
			transaction.occurredAt,
			timeZone,
			sql`${bounds.monthStart}::date - interval '1 month'`,
			bounds.monthStart,
		),
	);
	const total = sql<number>`coalesce(sum(${transaction.homeAmountMinor}), 0)::bigint`;
	const [[now], [before]] = await Promise.all([
		db
			.select({ spent: total, count: sql<number>`count(*)::int` })
			.from(transaction)
			.where(thisMonth),
		db.select({ spent: total }).from(transaction).where(lastMonth),
	]);
	const view: SharedView = {
		...base,
		month: {
			spentMinor: Number(now?.spent ?? 0),
			lastMonthMinor: Number(before?.spent ?? 0),
			count: now?.count ?? 0,
		},
	};
	if (!levelIncludes(grant.level, "categories")) return view;

	const byCategory = await db
		.select({
			name: category.name,
			icon: category.icon,
			tint: category.tint,
			spent: total,
		})
		.from(transaction)
		.innerJoin(category, eq(category.id, transaction.categoryId))
		.where(thisMonth)
		.groupBy(category.id, category.name, category.icon, category.tint)
		.orderBy(desc(total));
	const withCategories: SharedView = {
		...view,
		categories: byCategory.map((c) => ({
			name: c.name,
			icon: c.icon,
			tint: c.tint,
			spentMinor: Number(c.spent),
		})),
	};
	if (!levelIncludes(grant.level, "transactions")) return withCategories;

	const showReceipts = levelIncludes(grant.level, "receipts");
	const rows = await db
		.select({
			id: transaction.id,
			merchant: transaction.merchant,
			category: category.name,
			icon: category.icon,
			tint: category.tint,
			amountMinor: transaction.homeAmountMinor,
			occurredAt: transaction.occurredAt,
			receiptId: receipt.id,
		})
		.from(transaction)
		.innerJoin(category, eq(category.id, transaction.categoryId))
		.leftJoin(
			receipt,
			and(
				eq(receipt.transactionId, transaction.id),
				eq(receipt.userId, ownerId),
			),
		)
		.where(live)
		.orderBy(desc(transaction.occurredAt), desc(transaction.id))
		.limit(RECENT_EXPENSES);
	return {
		...withCategories,
		expenses: rows.map((r) => ({
			id: r.id,
			merchant: r.merchant,
			category: r.category,
			icon: r.icon,
			tint: r.tint,
			amountMinor: r.amountMinor,
			occurredAt: r.occurredAt.toISOString(),
			receiptId: showReceipts ? r.receiptId : null,
		})),
	};
}

/** True when `receiptId` belongs to a live expense of `ownerId`. */
export async function isSharedReceipt(
	db: Db,
	ownerId: string,
	receiptId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: receipt.id })
		.from(receipt)
		.innerJoin(transaction, eq(transaction.id, receipt.transactionId))
		.where(
			and(
				eq(receipt.id, receiptId),
				eq(receipt.userId, ownerId),
				isNull(transaction.deletedAt),
			),
		)
		.limit(1);
	return Boolean(row);
}
