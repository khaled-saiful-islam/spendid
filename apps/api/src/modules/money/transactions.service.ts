import { type Db, profile } from "@spendid/db";
import {
	type Transaction,
	type TransactionInput,
	TransactionInputSchema,
	type TransactionPatch,
	TransactionPatchSchema,
} from "@spendid/shared";
import { eq } from "drizzle-orm";
import { badRequest, notFound } from "../../http/app-error";
import type { CategoryRepository } from "./categories.repository";
import type { FxRepository } from "./fx.repository";
import { type TransactionRepository, toDto } from "./transactions.repository";

interface Deps {
	db: Db;
	transactions: TransactionRepository;
	categories: CategoryRepository;
	fx: FxRepository;
}

/** Adds, edits and removes spending, always converting into the person's home currency. */
export function createTransactionService({
	db,
	transactions,
	categories,
	fx,
}: Deps) {
	async function homeCurrencyOf(userId: string): Promise<string> {
		const [row] = await db
			.select({ home: profile.homeCurrency })
			.from(profile)
			.where(eq(profile.userId, userId))
			.limit(1);
		return row?.home ?? "MYR";
	}

	async function assertCategory(
		userId: string,
		categoryId: string,
	): Promise<void> {
		if (!(await categories.isVisibleTo(userId, categoryId)))
			throw badRequest("Pick one of your categories.");
	}

	return {
		async create(userId: string, raw: TransactionInput): Promise<Transaction> {
			const input = TransactionInputSchema.parse(raw);
			await assertCategory(userId, input.categoryId);
			const homeCurrency = await homeCurrencyOf(userId);
			const { homeMinor, rate } = await fx.convert(
				input.amountMinor,
				input.currency,
				homeCurrency,
			);
			return transactions.insert({
				userId,
				amountMinor: input.amountMinor,
				currency: input.currency,
				homeAmountMinor: homeMinor,
				homeCurrency,
				fxRate: String(rate),
				categoryId: input.categoryId,
				merchant: input.merchant || null,
				note: input.note || null,
				source: input.source,
				occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
			});
		},

		async update(
			userId: string,
			id: string,
			raw: TransactionPatch,
		): Promise<Transaction> {
			const patch = TransactionPatchSchema.parse(raw);
			const existing = await transactions.findOwned(userId, id);
			if (!existing || existing.deletedAt) throw notFound("Expense");
			if (patch.categoryId) await assertCategory(userId, patch.categoryId);

			const amountMinor = patch.amountMinor ?? existing.amountMinor;
			const currency = patch.currency ?? existing.currency;
			const moneyChanged =
				amountMinor !== existing.amountMinor || currency !== existing.currency;
			const converted = moneyChanged
				? await fx.convert(amountMinor, currency, existing.homeCurrency)
				: null;

			const updated = await transactions.update(userId, id, {
				amountMinor,
				currency,
				...(converted && {
					homeAmountMinor: converted.homeMinor,
					fxRate: String(converted.rate),
				}),
				...(patch.categoryId && { categoryId: patch.categoryId }),
				...(patch.merchant !== undefined && {
					merchant: patch.merchant || null,
				}),
				...(patch.note !== undefined && { note: patch.note || null }),
				...(patch.occurredAt && { occurredAt: new Date(patch.occurredAt) }),
			});
			return updated ?? toDto(existing);
		},

		async remove(userId: string, id: string): Promise<Transaction> {
			const row = await transactions.setDeleted(userId, id, true);
			if (!row) throw notFound("Expense");
			return row;
		},

		async restore(userId: string, id: string): Promise<Transaction> {
			const row = await transactions.setDeleted(userId, id, false);
			if (!row) throw notFound("Expense");
			return row;
		},
	};
}

export type TransactionService = ReturnType<typeof createTransactionService>;
