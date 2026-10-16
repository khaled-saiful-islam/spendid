import {
	aiUsage,
	budget,
	category,
	checkIn,
	connection,
	type Db,
	goal,
	goalDeposit,
	merchant,
	notificationPref,
	profile,
	receipt,
	shareGrant,
	split,
	transaction,
	user,
	warranty,
	wish,
} from "@spendid/db";
import type { FileStore } from "@spendid/server";
import { minorDigits } from "@spendid/shared";
import { asc, eq, or, sql } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";

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

const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));

const README = `Your Spendid data
=================

account.json         Your account, settings and email choices
transactions.csv     Every expense (open in Excel, Numbers or Google Sheets)
transactions.json    The same, with every field
categories.json      Categories you made
budgets.json         Monthly limits
goals.json           Savings goals and every deposit
receipts.json        What was read from each receipt
receipts/            Your receipt photos
warranties.json      Warranty reminders
wishlist.json        Impulse-pause items and what you decided
check-ins.json       Nightly check-ins
family.json          Your family circle: who, how you're related, what each side shares
splits.json          Bills you split
shops.json           Shop names Spendid learned and their usual category
ai-usage.json        How much AI you used per month (counts only)

Amounts are in each expense's own currency and in your home currency.
`;

/**
 * Builds the "download everything" zip for one person. Only their own rows are read; for
 * family links, the other person appears by name and relation only.
 */
export async function buildArchive(
	db: Db,
	store: FileStore,
	userId: string,
): Promise<Uint8Array> {
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
		.orderBy(asc(transaction.occurredAt));
	const live = txs.filter((t) => !t.deletedAt);

	const receipts = await db
		.select()
		.from(receipt)
		.where(eq(receipt.userId, userId));
	const files: Record<string, Uint8Array> = {};
	for (const r of receipts) {
		try {
			files[`receipts/${r.id}.${EXT[r.mime] ?? "bin"}`] = new Uint8Array(
				await store.get(r.fileKey),
			);
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

	const entries: Record<string, Uint8Array> = {
		"README.txt": strToU8(README),
		"account.json": json({
			...account,
			profile: settings ?? null,
			emails: emails ?? null,
			exportedAt: new Date().toISOString(),
		}),
		"transactions.csv": strToU8(
			toCsv([
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
		),
		"transactions.json": json(txs),
		"categories.json": json(
			await db.select().from(category).where(eq(category.userId, userId)),
		),
		"budgets.json": json(
			await db.select().from(budget).where(eq(budget.userId, userId)),
		),
		"goals.json": json(
			goals.map((g) => ({
				...g,
				deposits: deposits.filter((d) => d.goalId === g.id),
			})),
		),
		"receipts.json": json(receipts.map(({ fileKey: _f, ...r }) => r)),
		"warranties.json": json(
			await db.select().from(warranty).where(eq(warranty.userId, userId)),
		),
		"wishlist.json": json(
			await db.select().from(wish).where(eq(wish.userId, userId)),
		),
		"check-ins.json": json(
			await db.select().from(checkIn).where(eq(checkIn.userId, userId)),
		),
		"family.json": json({
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
		}),
		"splits.json": json(
			await db.select().from(split).where(eq(split.ownerId, userId)),
		),
		"shops.json": json(
			await db
				.select({
					name: merchant.name,
					categoryId: merchant.categoryId,
					uses: merchant.uses,
				})
				.from(merchant)
				.where(eq(merchant.userId, userId)),
		),
		"ai-usage.json": json(usage),
		...files,
	};
	return zipSync(entries, { level: 6 });
}
