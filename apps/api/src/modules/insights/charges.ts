import { category, type Db, profile, transaction } from "@spendid/db";
import {
	billsStillDue,
	type Charge,
	detectRecurring,
	merchantKey,
	type RecurringOverview,
} from "@spendid/shared";
import { and, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { monthBounds } from "../money/summary.service";

const HISTORY_DAYS = 400;

/** The person's currency and time zone, with safe defaults. */
export async function homeOf(
	db: Db,
	userId: string,
): Promise<{ currency: string; timeZone: string }> {
	const [p] = await db
		.select({ currency: profile.homeCurrency, timeZone: profile.timeZone })
		.from(profile)
		.where(eq(profile.userId, userId))
		.limit(1);
	return { currency: p?.currency ?? "MYR", timeZone: p?.timeZone ?? "UTC" };
}

/** About 13 months of named charges, in the person's own days. */
export async function loadCharges(
	db: Db,
	userId: string,
	timeZone: string,
): Promise<Charge[]> {
	const rows = await db
		.select({
			merchant: transaction.merchant,
			amountMinor: transaction.homeAmountMinor,
			day: sql<string>`(${transaction.occurredAt} at time zone ${timeZone})::date::text`,
			categoryId: transaction.categoryId,
			slug: category.slug,
		})
		.from(transaction)
		.innerJoin(category, eq(category.id, transaction.categoryId))
		.where(
			and(
				eq(transaction.userId, userId),
				isNull(transaction.deletedAt),
				isNotNull(transaction.merchant),
				gt(
					transaction.occurredAt,
					sql`now() - make_interval(days => ${HISTORY_DAYS})`,
				),
			),
		);
	return rows.map((r) => ({
		merchant: r.merchant ?? "",
		merchantKey: merchantKey(r.merchant ?? ""),
		amountMinor: r.amountMinor,
		day: r.day,
		categoryId: r.categoryId,
		billLike: r.slug === "bills" || r.slug === "subscriptions",
	}));
}

/** Subscriptions and bills, plus what's still due this month. Used by Insights and safe-to-spend. */
export async function recurringFor(
	db: Db,
	userId: string,
): Promise<RecurringOverview> {
	const { currency, timeZone } = await homeOf(db, userId);
	const [charges, bounds] = await Promise.all([
		loadCharges(db, userId, timeZone),
		monthBounds(db, timeZone),
	]);
	const found = detectRecurring(charges, bounds.today);
	const cats = found.length
		? await db
				.select({
					id: category.id,
					name: category.name,
					icon: category.icon,
					tint: category.tint,
				})
				.from(category)
				.where(
					inArray(category.id, [...new Set(found.map((r) => r.categoryId))]),
				)
		: [];
	const catOf = new Map(cats.map((c) => [c.id, c]));
	const monthEnd = new Date(
		Date.parse(`${bounds.nextMonth}T00:00:00Z`) - 86_400_000,
	)
		.toISOString()
		.slice(0, 10);
	return {
		currency,
		items: found.map((r) => {
			const c = catOf.get(r.categoryId);
			return {
				...r,
				categoryName: c?.name ?? "Other",
				icon: c?.icon ?? "Shapes",
				tint: c?.tint ?? "slate",
			};
		}),
		monthlyMinor: found.reduce((s, r) => s + r.monthlyMinor, 0),
		billsDue: billsStillDue(found, bounds.today, monthEnd),
	};
}
