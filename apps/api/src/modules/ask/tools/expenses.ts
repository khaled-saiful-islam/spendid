import { category, transaction } from "@spendid/db";
import type { ExpenseLook, TransactionPatch } from "@spendid/shared";
import { toMinor } from "@spendid/shared";
import {
	and,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { tool } from "langchain";
import { z } from "zod";
import {
	type AskContext,
	CategoryWord,
	closestWord,
	DateSchema,
	escapeLike,
	localToday,
	NOT_SAVED,
	offerTo,
	type SideChannel,
	SLUGS,
	shown,
	type ToolDeps,
	unknownCategory,
} from "./context";

/** How far back "that expense" can reach. */
const LOOK_BACK_DAYS = 62;

/** Fix or delete one of the person's own expenses, as a card with Undo. */
export function expenseTools(
	deps: ToolDeps,
	ctx: AskContext,
	side: SideChannel,
) {
	const { db } = deps;
	const offer = offerTo(side);
	const localDay = sql<string>`to_char((${transaction.occurredAt} at time zone ${ctx.timeZone})::date, 'YYYY-MM-DD')`;
	const nameOf = (id: string) =>
		ctx.categories.find((c) => c.id === id)?.name ?? "Other";

	const proposeExpenseChange = tool(
		async (input) => {
			const today = localToday(ctx.timeZone);
			const where = [
				eq(transaction.userId, ctx.userId),
				isNull(transaction.deletedAt),
				gte(
					transaction.occurredAt,
					sql`now() - make_interval(days => ${LOOK_BACK_DAYS})`,
				),
			];
			if (input.shop) {
				const term = `%${escapeLike(input.shop.trim())}%`;
				const match = or(
					ilike(transaction.merchant, term),
					ilike(transaction.note, term),
					ilike(category.name, term),
				);
				if (match) where.push(match);
			}
			if (input.day) where.push(sql`${localDay} = ${input.day}`);
			const find = (extra: SQL[] = []) =>
				db
					.select({
						id: transaction.id,
						merchant: transaction.merchant,
						amountMinor: transaction.amountMinor,
						currency: transaction.currency,
						categoryId: transaction.categoryId,
						occurredAt: transaction.occurredAt,
						day: localDay,
					})
					.from(transaction)
					.innerJoin(category, eq(category.id, transaction.categoryId))
					.where(and(...where, ...extra))
					.orderBy(desc(transaction.occurredAt))
					.limit(20);
			let { amount, newAmount } = input;
			// The amount is matched in the database, so an older expense is found too (not just
			// among the newest 20). Its minor units depend on the currency, so allow each size.
			const asked = amount;
			const rows =
				asked === null || asked === undefined
					? await find()
					: await find([
							inArray(
								transaction.amountMinor,
								[0, 2, 3].map((digits) => Math.round(asked * 10 ** digits)),
							),
						]);
			let byAmount =
				asked === null || asked === undefined
					? rows
					: rows.filter((r) => r.amountMinor === toMinor(asked, r.currency));
			// "change my Grab to 15": the model sometimes puts the new amount in `amount`.
			const noOtherChange =
				!input.remove && !input.newCategory && !input.newShop && !input.newDay;
			if (byAmount.length === 0 && amount && !newAmount && noOtherChange) {
				const recent = await find();
				if (recent.length > 0) {
					newAmount = amount;
					amount = null;
					byAmount = recent;
				}
			}
			const candidates = input.latest ? byAmount.slice(0, 1) : byAmount;
			if (candidates.length === 0)
				return "No matching expense in the last two months. Ask which one (shop, day or amount).";
			if (candidates.length > 1)
				return JSON.stringify({
					note: "Several expenses match. Ask which one, naming the day and amount; or use latest if they mean the most recent.",
					matches: candidates.slice(0, 6).map((r) => ({
						day: r.day,
						shop: r.merchant ?? nameOf(r.categoryId),
						amount: shown(r.amountMinor, r.currency),
					})),
				});

			const row = candidates[0];
			if (!row) return "No matching expense.";
			const look: ExpenseLook = {
				merchant: row.merchant,
				amountMinor: row.amountMinor,
				categoryName: nameOf(row.categoryId),
				day: row.day,
			};
			if (input.remove)
				return (
					offer({
						kind: "expense-delete",
						transactionId: row.id,
						currency: row.currency,
						look,
					}) ?? NOT_SAVED
				);

			const patch: TransactionPatch = {};
			const undo: TransactionPatch = {};
			const after: ExpenseLook = { ...look };
			if (newAmount !== null && newAmount !== undefined) {
				const minor = toMinor(newAmount, row.currency);
				if (minor <= 0) return "The new amount must be above zero.";
				patch.amountMinor = minor;
				undo.amountMinor = row.amountMinor;
				after.amountMinor = minor;
			}
			if (input.newCategory) {
				const slug = closestWord(input.newCategory, SLUGS);
				const found = ctx.categories.find((c) => c.slug === slug);
				if (!found) return unknownCategory();
				patch.categoryId = found.id;
				undo.categoryId = row.categoryId;
				after.categoryName = found.name;
			}
			if (input.newShop?.trim()) {
				const name = input.newShop.trim().slice(0, 80);
				patch.merchant = name.charAt(0).toUpperCase() + name.slice(1);
				undo.merchant = row.merchant;
				after.merchant = patch.merchant;
			}
			if (input.newDay) {
				if (input.newDay > today) return "That day is in the future.";
				// Same time of day, moved to the new date.
				const shift =
					Date.parse(`${input.newDay}T00:00:00Z`) -
					Date.parse(`${row.day}T00:00:00Z`);
				patch.occurredAt = new Date(
					row.occurredAt.getTime() + shift,
				).toISOString();
				undo.occurredAt = row.occurredAt.toISOString();
				after.day = input.newDay;
			}
			if (Object.keys(patch).length === 0)
				return "Nothing to change was given. Ask what should change (amount, category, shop or day), or whether to delete it.";
			return (
				offer({
					kind: "expense-edit",
					transactionId: row.id,
					currency: row.currency,
					before: look,
					after,
					patch,
					undo,
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_expense_change",
			description: `Fix or delete one of the person's expenses from the last two months ("yesterday's Grab was 15, not 18", "move the Tealive to food", "delete the duplicate coffee"). Identify it by shop word, day (YYYY-MM-DD) and/or its current amount; set latest when they mean the most recent match. Give the new values, or remove to delete. If several match you get the list: ask which one.`,
			schema: z.object({
				shop: z
					.string()
					.max(40)
					.nullish()
					.describe("A word in the shop name or note"),
				day: DateSchema.nullish(),
				amount: z.number().positive().nullish().describe("Its current amount"),
				latest: z.boolean().nullish(),
				newAmount: z.number().positive().nullish(),
				newCategory: CategoryWord.nullish(),
				newShop: z.string().max(80).nullish(),
				newDay: DateSchema.nullish(),
				remove: z.boolean().nullish(),
			}),
		},
	);

	return [proposeExpenseChange];
}
