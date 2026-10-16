import { category, type Db, goal, transaction, user } from "@spendid/db";
import { and, eq, isNull } from "drizzle-orm";

/** [days ago, hour, category slug, merchant, amount in sen] — a believable month for Maya. */
const SPENDS: [number, number, string, string, number][] = [
	[0, 8, "food", "Kopi & kaya toast", 680],
	[0, 13, "food", "Nasi lemak ayam", 1250],
	[1, 9, "transport", "Grab to office", 1820],
	[1, 19, "groceries", "Jaya Grocer", 8640],
	[2, 12, "food", "Sushi lunch", 3290],
	[2, 21, "subscriptions", "Netflix", 5500],
	[3, 18, "transport", "Petrol", 6000],
	[4, 20, "fun", "GSC movie night", 4200],
	[5, 11, "shopping", "Uniqlo", 12990],
	[6, 13, "food", "Mamak lunch", 1450],
	[7, 10, "health", "Guardian pharmacy", 3480],
	[8, 19, "groceries", "AEON", 15420],
	[9, 8, "food", "Starbucks", 1890],
	[10, 15, "bills", "TNB electricity", 18750],
	[11, 9, "transport", "Touch 'n Go reload", 5000],
	[12, 20, "care", "Haircut", 4500],
	[13, 13, "food", "Thai lunch", 2380],
	[14, 10, "bills", "Unifi internet", 12900],
];

/** Fills the current month for a demo person, only once (skips if they already have spending). */
export async function seedDemoMonth(db: Db, username: string): Promise<void> {
	const [person] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.username, username))
		.limit(1);
	if (!person) return;
	const [already] = await db
		.select({ id: transaction.id })
		.from(transaction)
		.where(eq(transaction.userId, person.id))
		.limit(1);
	if (already) return;

	const cats = await db
		.select({ id: category.id, slug: category.slug })
		.from(category)
		.where(isNull(category.userId));
	const idOf = new Map(cats.map((c) => [c.slug, c.id]));
	const now = new Date();
	const dayOfMonth = now.getDate();

	const rows = SPENDS.filter(([daysAgo]) => daysAgo < dayOfMonth).flatMap(
		([daysAgo, hour, slug, merchant, sen]) => {
			const categoryId = idOf.get(slug);
			if (!categoryId) return [];
			const at = new Date(now);
			at.setDate(now.getDate() - daysAgo);
			// Demo people live in Kuala Lumpur (UTC+8, no daylight saving).
			at.setUTCHours(hour - 8, 0, 0, 0);
			if (at > now) at.setTime(now.getTime() - 60_000);
			return [
				{
					userId: person.id,
					amountMinor: sen,
					currency: "MYR",
					homeAmountMinor: sen,
					homeCurrency: "MYR",
					categoryId,
					merchant,
					occurredAt: at,
				},
			];
		},
	);
	if (rows.length) await db.insert(transaction).values(rows);

	const [hasGoal] = await db
		.select({ id: goal.id })
		.from(goal)
		.where(and(eq(goal.userId, person.id), isNull(goal.archivedAt)))
		.limit(1);
	if (!hasGoal) {
		const inFiveMonths = new Date(now.getFullYear(), now.getMonth() + 5, 15)
			.toISOString()
			.slice(0, 10);
		await db.insert(goal).values([
			{
				userId: person.id,
				name: "Bali trip",
				emoji: "🏝️",
				targetMinor: 400_000,
				savedMinor: 120_000,
				targetDate: inFiveMonths,
			},
			{
				userId: person.id,
				name: "Rainy-day fund",
				emoji: "☂️",
				targetMinor: 1_000_000,
				savedMinor: 350_000,
				targetDate: null,
			},
		]);
	}
	process.stdout.write(
		`[seed] ${rows.length} demo expenses + goals for ${username}\n`,
	);
}
