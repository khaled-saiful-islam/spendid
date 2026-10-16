import { type Db, profile } from "@spendid/db";
import type { MerchantMemory } from "@spendid/server";
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
	/** Called after someone's spending changes (live family pulse). Never awaited. */
	onChange?: (userId: string) => Promise<unknown>;
	/** Shop names and learned categories (smart categories, clean merchant names). */
	merchants?: MerchantMemory;
	/** A shop seen for the first time: match it to known ones in the background. */
	onNewMerchant?: (merchantId: string) => Promise<unknown>;
	/** After a new expense: budget, unusual and double-charge alerts. Never awaited. */
	onCreated?: (userId: string, transactionId: string) => Promise<unknown>;
}

/** Adds, edits and removes spending, always converting into the person's home currency. */
export function createTransactionService({
	db,
	transactions,
	categories,
	fx,
	onChange,
	merchants,
	onNewMerchant,
	onCreated,
}: Deps) {
	const changed = <T>(userId: string, value: T): T => {
		onChange?.(userId).catch(() => undefined);
		return value;
	};

	const nameFor = async (userId: string, raw: string | null | undefined) =>
		raw && merchants ? merchants.displayName(userId, raw) : raw || null;

	/** Every save teaches Spendid which category this shop belongs in. */
	async function learn(
		userId: string,
		name: string | null,
		categoryId: string,
		uses: number,
	): Promise<void> {
		if (!name || !merchants) return;
		const learned = await merchants.remember(userId, name, categoryId, uses);
		if (learned?.created)
			onNewMerchant?.(learned.row.id).catch(() => undefined);
	}

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
			const merchant = await nameFor(userId, input.merchant);
			const created = await transactions.insert({
				userId,
				amountMinor: input.amountMinor,
				currency: input.currency,
				homeAmountMinor: homeMinor,
				homeCurrency,
				fxRate: String(rate),
				categoryId: input.categoryId,
				merchant,
				note: input.note || null,
				source: input.source,
				occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
			});
			await learn(userId, merchant, input.categoryId, 1);
			onCreated?.(userId, created.id).catch(() => undefined);
			return changed(userId, created);
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

			const merchant =
				patch.merchant !== undefined
					? await nameFor(userId, patch.merchant)
					: existing.merchant;
			const updated = await transactions.update(userId, id, {
				amountMinor,
				currency,
				...(converted && {
					homeAmountMinor: converted.homeMinor,
					fxRate: String(converted.rate),
				}),
				...(patch.categoryId && { categoryId: patch.categoryId }),
				...(patch.merchant !== undefined && { merchant }),
				...(patch.note !== undefined && { note: patch.note || null }),
				...(patch.occurredAt && { occurredAt: new Date(patch.occurredAt) }),
			});
			// A changed category is a correction: the shop's category follows it.
			if (patch.categoryId || patch.merchant !== undefined)
				await learn(
					userId,
					merchant,
					patch.categoryId ?? existing.categoryId,
					0,
				);
			return changed(userId, updated ?? toDto(existing));
		},

		async remove(userId: string, id: string): Promise<Transaction> {
			const row = await transactions.setDeleted(userId, id, true);
			if (!row) throw notFound("Expense");
			return changed(userId, row);
		},

		async restore(userId: string, id: string): Promise<Transaction> {
			const row = await transactions.setDeleted(userId, id, false);
			if (!row) throw notFound("Expense");
			return changed(userId, row);
		},
	};
}

export type TransactionService = ReturnType<typeof createTransactionService>;
