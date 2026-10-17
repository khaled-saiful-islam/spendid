import { type Db, subscription, transaction } from "@spendid/db";
import {
	type BillingCycle,
	brandOf,
	daysUntil,
	dueDatesUntil,
	MarkPaidSchema,
	merchantKey,
	nextDueAfter,
	type Subscription,
	SubscriptionInputSchema,
	type SubscriptionOverview,
	sameMerchant,
	type Transaction,
	yearlyCost,
} from "@spendid/shared";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { badRequest, notFound } from "../../http/app-error";
import { homeOf, recurringFor } from "../insights/charges";
import type { CategoryRepository } from "../money/categories.repository";
import { monthBounds } from "../money/summary.service";

type Row = typeof subscription.$inferSelect;

interface Deps {
	db: Db;
	categories: CategoryRepository;
	/** Logs the payment as a normal expense (currency, alerts and shop memory included). */
	addExpense: (
		userId: string,
		input: {
			amountMinor: number;
			currency: string;
			categoryId: string;
			merchant: string;
			note: string | null;
			source: "manual";
		},
	) => Promise<Transaction>;
}

const toDto = (r: Row): Subscription => ({
	id: r.id,
	name: r.name,
	brand: r.brand,
	amountMinor: r.amountMinor,
	currency: r.currency,
	amountVaries: r.amountVaries,
	cycle: r.cycle,
	nextDue: r.nextDue,
	dueDay: r.dueDay,
	remindDays: r.remindDays,
	categoryId: r.categoryId,
	note: r.note,
	lastPaidOn: r.lastPaidOn,
	cancelledAt: r.cancelledAt?.toISOString() ?? null,
});

/** How close a logged expense must be to the due date to count as paying it. */
function paymentWindow(cycle: BillingCycle): { before: number; after: number } {
	return cycle === "weekly"
		? { before: 2, after: 2 }
		: { before: 7, after: 10 };
}

const dayOfMonth = (day: string) => Number(day.slice(8, 10));

/** Subscriptions and regular bills the person added. Every query is scoped to the owner. */
export function createSubscriptionService(deps: Deps) {
	const { db } = deps;
	const owned = (userId: string, id: string) =>
		and(eq(subscription.userId, userId), eq(subscription.id, id));

	async function find(userId: string, id: string): Promise<Row> {
		const [row] = await db
			.select()
			.from(subscription)
			.where(owned(userId, id))
			.limit(1);
		if (!row) throw notFound("Subscription");
		return row;
	}

	async function assertCategory(
		userId: string,
		categoryId: string,
	): Promise<void> {
		const cats = await deps.categories.listFor(userId);
		if (!cats.some((c) => c.id === categoryId))
			throw badRequest("Pick a category.");
	}

	async function today(
		userId: string,
	): Promise<{ today: string; monthEnd: string; currency: string }> {
		const { timeZone, currency } = await homeOf(db, userId);
		const b = await monthBounds(db, timeZone);
		const monthEnd = new Date(
			Date.parse(`${b.nextMonth}T00:00:00Z`) - 86_400_000,
		)
			.toISOString()
			.slice(0, 10);
		return { today: b.today, monthEnd, currency };
	}

	return {
		async overview(userId: string): Promise<SubscriptionOverview> {
			const [{ today: day, monthEnd, currency }, rows, recurring] =
				await Promise.all([
					today(userId),
					db
						.select()
						.from(subscription)
						.where(eq(subscription.userId, userId))
						.orderBy(asc(subscription.nextDue)),
					recurringFor(db, userId),
				]);
			const active = rows.filter((r) => !r.cancelledAt).map(toDto);
			const cancelled = rows.filter((r) => r.cancelledAt).map(toDto);
			const monthStart = `${day.slice(0, 7)}-01`;

			const thisMonth = active.flatMap((s) => {
				const unpaid = dueDatesUntil(s, monthEnd).map((d) => ({
					subscriptionId: s.id,
					day: d < monthStart ? day : d,
					amountMinor: s.amountMinor,
					paid: false,
				}));
				const paid =
					s.lastPaidOn && s.lastPaidOn >= monthStart
						? [
								{
									subscriptionId: s.id,
									day: s.lastPaidOn,
									amountMinor: s.amountMinor,
									paid: true,
								},
							]
						: [];
				return [...paid, ...unpaid];
			});
			thisMonth.sort((a, b) => a.day.localeCompare(b.day));

			const keys = active.map((s) => merchantKey(s.name));
			return {
				currency,
				today: day,
				active,
				cancelled,
				thisMonth,
				thisMonthMinor: thisMonth.reduce((n, p) => n + p.amountMinor, 0),
				stillDueMinor: thisMonth
					.filter((p) => !p.paid)
					.reduce((n, p) => n + p.amountMinor, 0),
				yearlyMinor: active.reduce(
					(n, s) => n + yearlyCost(s.amountMinor, s.cycle),
					0,
				),
				suggestions: recurring.items
					.filter((r) => !keys.some((k) => sameMerchant(k, r.merchantKey)))
					.slice(0, 6)
					.map((r) => ({
						merchant: r.merchant,
						amountMinor: r.amountMinor,
						cadence: r.cadence,
						lastDay: r.lastDay,
					})),
			};
		},

		async create(userId: string, raw: unknown): Promise<Subscription> {
			const input = SubscriptionInputSchema.parse(raw);
			await assertCategory(userId, input.categoryId);
			const [row] = await db
				.insert(subscription)
				.values({
					userId,
					name: input.name,
					brand: brandOf(input.brand) ? (input.brand ?? null) : null,
					amountMinor: input.amountMinor,
					currency: input.currency,
					amountVaries: input.amountVaries,
					cycle: input.cycle,
					nextDue: input.nextDue,
					dueDay: dayOfMonth(input.nextDue),
					remindDays: input.remindDays,
					categoryId: input.categoryId,
					note: input.note ?? null,
				})
				.returning();
			if (!row) throw new Error("subscription insert returned nothing");
			return toDto(row);
		},

		async update(
			userId: string,
			id: string,
			raw: unknown,
		): Promise<Subscription> {
			const input = SubscriptionInputSchema.parse(raw);
			await find(userId, id);
			await assertCategory(userId, input.categoryId);
			const [row] = await db
				.update(subscription)
				.set({
					name: input.name,
					brand: brandOf(input.brand) ? (input.brand ?? null) : null,
					amountMinor: input.amountMinor,
					currency: input.currency,
					amountVaries: input.amountVaries,
					cycle: input.cycle,
					nextDue: input.nextDue,
					dueDay: dayOfMonth(input.nextDue),
					remindDays: input.remindDays,
					categoryId: input.categoryId,
					note: input.note ?? null,
				})
				.where(owned(userId, id))
				.returning();
			if (!row) throw notFound("Subscription");
			return toDto(row);
		},

		/** Logs the payment as an expense and moves the due date to the next one. */
		async markPaid(
			userId: string,
			id: string,
			raw: unknown,
		): Promise<{ subscription: Subscription; expense: Transaction }> {
			const { amountMinor } = MarkPaidSchema.parse(raw ?? {});
			const row = await find(userId, id);
			if (row.cancelledAt) throw badRequest("This subscription is cancelled.");
			const { today: day } = await today(userId);
			// Move the date first, so the expense below isn't taken as paying the next one too.
			const [moved] = await db
				.update(subscription)
				.set({
					nextDue: nextDueAfter(row.nextDue, row.cycle, row.dueDay),
					lastPaidOn: day,
				})
				.where(owned(userId, id))
				.returning();
			const expense = await deps.addExpense(userId, {
				amountMinor: amountMinor ?? row.amountMinor,
				currency: row.currency,
				categoryId: row.categoryId,
				merchant: row.name,
				note: null,
				source: "manual",
			});
			return { subscription: toDto(moved ?? row), expense };
		},

		async cancel(userId: string, id: string): Promise<Subscription> {
			await find(userId, id);
			const [row] = await db
				.update(subscription)
				.set({ cancelledAt: new Date() })
				.where(owned(userId, id))
				.returning();
			if (!row) throw notFound("Subscription");
			return toDto(row);
		},

		async restore(userId: string, id: string): Promise<Subscription> {
			const existing = await find(userId, id);
			const { today: day } = await today(userId);
			let next = existing.nextDue;
			while (next < day)
				next = nextDueAfter(next, existing.cycle, existing.dueDay);
			const [row] = await db
				.update(subscription)
				.set({ cancelledAt: null, nextDue: next })
				.where(owned(userId, id))
				.returning();
			if (!row) throw notFound("Subscription");
			return toDto(row);
		},

		async remove(userId: string, id: string): Promise<void> {
			await find(userId, id);
			await db.delete(subscription).where(owned(userId, id));
		},

		/**
		 * After someone logs an expense: if it's a subscription they added, paid around its due
		 * date, count it as paid so it isn't also kept aside.
		 */
		async noticePayment(userId: string, transactionId: string): Promise<void> {
			const [tx] = await db
				.select({
					merchant: transaction.merchant,
					occurredAt: transaction.occurredAt,
				})
				.from(transaction)
				.where(
					and(
						eq(transaction.userId, userId),
						eq(transaction.id, transactionId),
					),
				)
				.limit(1);
			const key = merchantKey(tx?.merchant ?? "");
			if (!tx || !key) return;
			const { today: day } = await today(userId);
			const subs = await db
				.select()
				.from(subscription)
				.where(
					and(
						eq(subscription.userId, userId),
						isNull(subscription.cancelledAt),
					),
				);
			const match = subs.find((s) => {
				if (!sameMerchant(merchantKey(s.name), key)) return false;
				const gap = daysUntil(s.nextDue, day);
				const w = paymentWindow(s.cycle);
				return gap <= w.before && gap >= -w.after;
			});
			if (!match) return;
			await db
				.update(subscription)
				.set({
					nextDue: nextDueAfter(match.nextDue, match.cycle, match.dueDay),
					lastPaidOn: day,
				})
				.where(owned(userId, match.id));
		},

		/** Active subscriptions whose reminder day is today, for the morning reminder email. */
		async remindersFor(userId: string): Promise<Subscription[]> {
			const { today: day } = await today(userId);
			const rows = await db
				.select()
				.from(subscription)
				.where(
					and(
						eq(subscription.userId, userId),
						isNull(subscription.cancelledAt),
						isNotNull(subscription.nextDue),
					),
				);
			return rows
				.filter((r) => {
					const gap = daysUntil(r.nextDue, day);
					return gap >= 0 && gap <= r.remindDays;
				})
				.map(toDto);
		},
	};
}

export type SubscriptionService = ReturnType<typeof createSubscriptionService>;
