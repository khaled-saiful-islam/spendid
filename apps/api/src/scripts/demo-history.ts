import { category, type Db, transaction, user } from "@spendid/db";
import { and, eq, isNull, lt } from "drizzle-orm";

/** [day of month, category slug, merchant, sen for 3, 2 and 1 months ago, and this month (0 = not yet)]. */
const RECURRING: [number, string, string, [number, number, number, number]][] =
	[
		[1, "health", "Anytime Fitness", [15900, 15900, 15900, 15900]],
		[20, "subscriptions", "Spotify", [1590, 1590, 1590, 0]],
		[25, "bills", "Celcom postpaid", [6800, 6800, 6800, 0]],
		[28, "subscriptions", "iCloud+", [1290, 1290, 1290, 0]],
	];

/** Last month's everyday spending, so Money Wrapped and comparisons have something real. */
const LAST_MONTH: [number, number, string, string, number][] = [
	[2, 13, "food", "Nasi lemak ayam", 1250],
	[3, 19, "groceries", "Jaya Grocer", 9420],
	[5, 12, "food", "Sushi lunch", 3590],
	[6, 21, "fun", "GSC movie night", 3900],
	[8, 11, "shopping", "Uniqlo", 8990],
	[9, 13, "food", "Mamak lunch", 1350],
	[11, 19, "groceries", "AEON", 13870],
	[12, 8, "food", "Starbucks", 1890],
	[13, 9, "transport", "Grab to office", 1720],
	[14, 21, "food", "Thai lunch", 2580],
	[16, 18, "transport", "Petrol", 6000],
	[18, 20, "fun", "Bowling with team", 5500],
	[19, 12, "food", "Village Park nasi lemak", 1600],
	[21, 19, "groceries", "Jaya Grocer", 7660],
	[22, 15, "shopping", "Popular bookstore", 6450],
	[24, 20, "food", "Birthday dinner", 18800],
	[26, 9, "transport", "Touch 'n Go reload", 5000],
	[27, 10, "care", "Haircut", 4500],
];

/** Bills the demo month already has, with the earlier months' amounts (Netflix went up). */
const PAST_BILLS: [number, string, string, [number, number, number]][] = [
	[14, "subscriptions", "Netflix", [4990, 4990, 4990]],
	[2, "bills", "Unifi internet", [12900, 12900, 12900]],
	[6, "bills", "TNB electricity", [17900, 16850, 17200]],
];

/** Kuala Lumpur time (UTC+8) on day `day` of the month `monthsAgo` before now, clamped to month end. */
function klDate(monthsAgo: number, day: number, hour: number): Date {
	const now = new Date();
	const first = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1),
	);
	const last = new Date(
		Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
	).getUTCDate();
	return new Date(
		Date.UTC(
			first.getUTCFullYear(),
			first.getUTCMonth(),
			Math.min(day, last),
			hour - 8,
		),
	);
}

/**
 * Three months of history for a demo person: subscriptions and bills (so Spendid can find
 * them, including a price rise) and a full previous month. Runs once.
 */
export async function seedDemoHistory(db: Db, username: string): Promise<void> {
	const [person] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.username, username))
		.limit(1);
	if (!person) return;
	const monthStart = klDate(0, 1, 0);
	const [already] = await db
		.select({ id: transaction.id })
		.from(transaction)
		.where(
			and(
				eq(transaction.userId, person.id),
				lt(transaction.occurredAt, monthStart),
			),
		)
		.limit(1);
	if (already) return;

	const cats = await db
		.select({ id: category.id, slug: category.slug })
		.from(category)
		.where(isNull(category.userId));
	const idOf = new Map(cats.map((c) => [c.slug, c.id]));
	const now = new Date();
	const rows: (typeof transaction.$inferInsert)[] = [];
	const add = (when: Date, slug: string, merchant: string, sen: number) => {
		const categoryId = idOf.get(slug);
		if (!categoryId || sen <= 0 || when > now) return;
		rows.push({
			userId: person.id,
			amountMinor: sen,
			currency: "MYR",
			homeAmountMinor: sen,
			homeCurrency: "MYR",
			categoryId,
			merchant,
			occurredAt: when,
		});
	};

	for (const [day, slug, merchant, amounts] of RECURRING)
		for (const [i, sen] of amounts.entries())
			add(klDate(3 - i, day, 9), slug, merchant, sen);
	for (const [day, slug, merchant, amounts] of PAST_BILLS)
		for (const [i, sen] of amounts.entries())
			add(klDate(3 - i, day, 10), slug, merchant, sen);
	for (const [day, hour, slug, merchant, sen] of LAST_MONTH)
		add(klDate(1, day, hour), slug, merchant, sen);

	if (rows.length) await db.insert(transaction).values(rows);
}
