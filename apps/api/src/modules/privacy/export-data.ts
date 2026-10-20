import {
	aiUsage,
	askThread,
	budget,
	category,
	checkIn,
	connection,
	type Db,
	goal,
	goalDeposit,
	merchant,
	monthlyTransfer,
	notificationPref,
	profile,
	receipt,
	shareGrant,
	split,
	subscription,
	transaction,
	user,
	warranty,
	wish,
} from "@spendid/db";
import type { FileStore } from "@spendid/server";
import { minorDigits } from "@spendid/shared";
import { desc, eq, or, sql } from "drizzle-orm";

const EXT: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

/** Minor units → "12.30" in the currency's own decimals. */
const major = (minor: number, currency: string) =>
	(minor / 10 ** minorDigits(currency)).toFixed(minorDigits(currency));

/** Text a spreadsheet would run as a formula (=, +, -, @, tab, CR), unless it's a plain number. */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * RFC 4180 CSV: quote every field, double inner quotes. Text that would start a formula
 * (e.g. a shop name read from a receipt) gets a leading apostrophe, so Excel shows it as text.
 */
export function toCsv(rows: (string | number | null)[][]): string {
	const cell = (v: string | number | null): string => {
		const text = String(v ?? "");
		const safe =
			typeof v === "string" &&
			FORMULA_START.test(text) &&
			!PLAIN_NUMBER.test(text)
				? `'${text}`
				: text;
		return `"${safe.replaceAll('"', '""')}"`;
	};
	return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export interface ReceiptPhoto {
	id: string;
	mime: string;
	ext: string;
	bytes: Uint8Array;
}

/**
 * Everything one person has put into Spendid, for "download everything". Only their own
 * rows are read; for family links, the other person appears by name and relation only.
 */
export async function gatherExport(db: Db, store: FileStore, userId: string) {
	const [account] = await db
		.select({
			name: user.name,
			email: user.email,
			username: user.username,
			createdAt: user.createdAt,
		})
		.from(user)
		.where(eq(user.id, userId));
	const [settings] = await db
		.select()
		.from(profile)
		.where(eq(profile.userId, userId));
	const [emails] = await db
		.select()
		.from(notificationPref)
		.where(eq(notificationPref.userId, userId));

	const txs = await db
		.select({
			id: transaction.id,
			occurredAt: transaction.occurredAt,
			merchant: transaction.merchant,
			category: category.name,
			amountMinor: transaction.amountMinor,
			currency: transaction.currency,
			homeAmountMinor: transaction.homeAmountMinor,
			homeCurrency: transaction.homeCurrency,
			fxRate: transaction.fxRate,
			note: transaction.note,
			source: transaction.source,
			deletedAt: transaction.deletedAt,
		})
		.from(transaction)
		.innerJoin(category, eq(category.id, transaction.categoryId))
		.where(eq(transaction.userId, userId))
		// Newest first, like everywhere else in the app.
		.orderBy(desc(transaction.occurredAt), desc(transaction.id));
	const live = txs.filter((t) => !t.deletedAt);

	const receipts = await db
		.select()
		.from(receipt)
		.where(eq(receipt.userId, userId));
	const photos: ReceiptPhoto[] = [];
	for (const r of receipts) {
		try {
			photos.push({
				id: r.id,
				mime: r.mime,
				ext: EXT[r.mime] ?? "bin",
				bytes: new Uint8Array(await store.get(r.fileKey)),
			});
		} catch {
			// A missing file shouldn't stop the rest of the export.
		}
	}

	const goals = await db.select().from(goal).where(eq(goal.userId, userId));
	const deposits = await db
		.select()
		.from(goalDeposit)
		.where(eq(goalDeposit.userId, userId));
	const connections = await db
		.select({
			requesterId: connection.requesterId,
			addresseeId: connection.addresseeId,
			relation: connection.relation,
			since: connection.createdAt,
			endedAt: connection.endedAt,
			otherName: sql<string>`(select name from "user" where id = case when ${connection.requesterId} = ${userId} then ${connection.addresseeId} else ${connection.requesterId} end)`,
		})
		.from(connection)
		.where(
			or(
				eq(connection.requesterId, userId),
				eq(connection.addresseeId, userId),
			),
		);
	const grants = await db
		.select()
		.from(shareGrant)
		.where(or(eq(shareGrant.ownerId, userId), eq(shareGrant.viewerId, userId)));
	const usage = await db
		.select({
			month: sql<string>`to_char(${aiUsage.createdAt}, 'YYYY-MM')`,
			feature: aiUsage.feature,
			tokens: sql<number>`sum(${aiUsage.billedTokens})::int`,
			calls: sql<number>`count(*)::int`,
		})
		.from(aiUsage)
		.where(eq(aiUsage.userId, userId))
		.groupBy(sql`1`, aiUsage.feature);

	return {
		exportedAt: new Date(),
		account: account ?? null,
		settings: settings ?? null,
		emails: emails ?? null,
		transactions: txs,
		live,
		csv: toCsv([
			[
				"Date",
				"Shop",
				"Category",
				"Amount",
				"Currency",
				"Home amount",
				"Home currency",
				"Note",
				"Added by",
			],
			...live.map((t) => [
				t.occurredAt.toISOString(),
				t.merchant,
				t.category,
				major(t.amountMinor, t.currency),
				t.currency,
				major(t.homeAmountMinor, t.homeCurrency),
				t.homeCurrency,
				t.note,
				t.source,
			]),
		]),
		categories: await db
			.select()
			.from(category)
			.where(eq(category.userId, userId)),
		budgets: await db
			.select({
				category: category.name,
				monthlyLimitMinor: budget.monthlyLimitMinor,
			})
			.from(budget)
			.innerJoin(category, eq(category.id, budget.categoryId))
			.where(eq(budget.userId, userId)),
		transfers: await db
			.select({
				name: monthlyTransfer.name,
				amountMinor: monthlyTransfer.amountMinor,
			})
			.from(monthlyTransfer)
			.where(eq(monthlyTransfer.userId, userId))
			.orderBy(monthlyTransfer.position),
		goals: goals.map((g) => ({
			...g,
			deposits: deposits.filter((d) => d.goalId === g.id),
		})),
		receipts: receipts.map(({ fileKey: _f, ...r }) => r),
		photos,
		warranties: await db
			.select()
			.from(warranty)
			.where(eq(warranty.userId, userId)),
		wishes: await db.select().from(wish).where(eq(wish.userId, userId)),
		checkIns: await db.select().from(checkIn).where(eq(checkIn.userId, userId)),
		subscriptions: await db
			.select()
			.from(subscription)
			.where(eq(subscription.userId, userId)),
		chats: await db
			.select({
				title: askThread.title,
				messages: askThread.messages,
				createdAt: askThread.createdAt,
				updatedAt: askThread.updatedAt,
			})
			.from(askThread)
			.where(eq(askThread.userId, userId)),
		family: {
			connections: connections.map((c) => ({
				with: c.otherName,
				relation: c.relation,
				iAsked: c.requesterId === userId,
				since: c.since,
				endedAt: c.endedAt,
			})),
			sharing: grants.map((g) => ({
				direction: g.ownerId === userId ? "I share" : "They share",
				level: g.level,
				paused: g.pausedAt !== null,
			})),
		},
		splits: await db.select().from(split).where(eq(split.ownerId, userId)),
		shops: await db
			.select({
				name: merchant.name,
				categoryId: merchant.categoryId,
				uses: merchant.uses,
			})
			.from(merchant)
			.where(eq(merchant.userId, userId)),
		aiUsage: usage,
	};
}

export type ExportData = Awaited<ReturnType<typeof gatherExport>>;
