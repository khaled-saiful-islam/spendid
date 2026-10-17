import {
	category,
	type Db,
	profile,
	transaction,
	user,
	warranty,
} from "@spendid/db";
import { daysUntil } from "@spendid/shared";
import {
	and,
	desc,
	eq,
	gte,
	isNotNull,
	isNull,
	lte,
	ne,
	sql,
} from "drizzle-orm";
import { recurringFor } from "../modules/insights/charges";
import type { InsightsService } from "../modules/insights/insights.service";
import type { SummaryService } from "../modules/money/summary.service";
import type { SubscriptionService } from "../modules/subscriptions/subscriptions.service";
import { localParts, type Notifier } from "./notifier";

const BILL_NOTICE_DAYS = 3;
const WARRANTY_NOTICE_DAYS = [30, 7];

const addDays = (day: string, n: number) =>
	new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
		.toISOString()
		.slice(0, 10);
const prettyDay = (day: string) =>
	new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});

/**
 * Hourly: for each person whose local time matches, send the digests that are due —
 * Monday 8am weekly summary; 9am bills, price rises and warranties; the 1st at 9am Wrapped.
 * Every email is de-duplicated, so a retried or doubled hour can't send twice.
 */
export function createDigests(deps: {
	db: Db;
	notifier: Notifier;
	summary: SummaryService;
	insights: InsightsService;
	/**
	 * The person's own subscriptions: reminders before each due date and a monthly plan.
	 * A getter, because the subscription service is built after notifications.
	 */
	subscriptions?: () => SubscriptionService | undefined;
}) {
	const { db } = deps;
	let sendNow = false;
	/** Same notifier, but "send now" (for `make digests`) skips quiet hours. */
	const notifier: Notifier = {
		...deps.notifier,
		notify: (userId, notice) =>
			deps.notifier.notify(userId, {
				...notice,
				urgent: notice.urgent || sendNow,
			}),
	};

	async function weekly(
		userId: string,
		timeZone: string,
		today: string,
		currency: string,
	): Promise<void> {
		const weekStart = addDays(today, -7);
		const prevStart = addDays(today, -14);
		const localDay = sql`(${transaction.occurredAt} at time zone ${timeZone})::date`;
		const range = (from: string, to: string) =>
			and(
				eq(transaction.userId, userId),
				isNull(transaction.deletedAt),
				sql`${localDay} >= ${from}::date`,
				sql`${localDay} < ${to}::date`,
			);
		const total = sql<string>`coalesce(sum(${transaction.homeAmountMinor}), 0)`;
		const [[week], [prev], [top], summary] = await Promise.all([
			db
				.select({ total, count: sql<number>`count(*)::int` })
				.from(transaction)
				.where(range(weekStart, today)),
			db.select({ total }).from(transaction).where(range(prevStart, weekStart)),
			db
				.select({ name: category.name, total })
				.from(transaction)
				.innerJoin(category, eq(category.id, transaction.categoryId))
				.where(range(weekStart, today))
				.groupBy(category.name)
				.orderBy(desc(total))
				.limit(1),
			deps.summary.forUser(userId),
		]);
		const spent = Number(week?.total ?? 0);
		const before = Number(prev?.total ?? 0);
		await notifier.notify(userId, {
			kind: "weekly-summary",
			group: "weekly",
			dedupeKey: `week:${weekStart}`,
			build: ({ money, appUrl }) => {
				const change =
					before === 0
						? "Here's how last week went."
						: spent <= before
							? `That's ${money(before - spent, currency)} less than the week before. Nice.`
							: `That's ${money(spent - before, currency)} more than the week before.`;
				return {
					subject: `Your week: ${money(spent, currency)} spent`,
					preview: change,
					heading: "Your week in money",
					body: `${change}${summary.safe.status === "no-income" ? "" : ` Today you can safely spend ${money(Math.max(0, summary.safe.safeTodayMinor), currency)}.`}`,
					rows: [
						{ label: "Spent last 7 days", value: money(spent, currency) },
						{ label: "Expenses", value: String(week?.count ?? 0) },
						...(top ? [{ label: "Most went to", value: top.name }] : []),
						{
							label: "Bills still due this month",
							value: money(summary.bills.minor, currency),
						},
					],
					action: "Open Spendid",
					url: `${appUrl}/app`,
				};
			},
		});
	}

	async function bills(
		userId: string,
		today: string,
		currency: string,
	): Promise<void> {
		const r = await recurringFor(db, userId);
		const soon = addDays(today, BILL_NOTICE_DAYS);
		for (const item of r.items) {
			if (item.nextDay > today && item.nextDay <= soon)
				await notifier.notify(userId, {
					kind: "bill-due",
					group: "bills",
					dedupeKey: `${item.merchantKey}:${item.nextDay}`,
					build: ({ money, appUrl }) => ({
						subject: `${item.merchant} is due ${prettyDay(item.nextDay)}`,
						preview: `About ${money(item.amountMinor, currency)}.`,
						heading: `${item.merchant} is coming up`,
						body: `Your ${item.merchant} charge of about ${money(item.amountMinor, currency)} usually lands around ${prettyDay(item.nextDay)}. It's already kept aside in your safe-to-spend.`,
						action: "See bills",
						url: `${appUrl}/app/activity?view=insights`,
					}),
				});
			// A price rise seen in the last few days.
			if (
				item.previousAmountMinor !== null &&
				item.amountMinor > item.previousAmountMinor &&
				item.lastDay >= addDays(today, -BILL_NOTICE_DAYS)
			) {
				const from = item.previousAmountMinor;
				await notifier.notify(userId, {
					kind: "price-rise",
					group: "bills",
					dedupeKey: `${item.merchantKey}:${item.lastDay}`,
					build: ({ money, appUrl }) => ({
						subject: `${item.merchant} went up`,
						preview: `${money(from, currency)} → ${money(item.amountMinor, currency)}`,
						heading: `${item.merchant} costs more now`,
						body: `Your last ${item.merchant} charge was ${money(item.amountMinor, currency)}, up from ${money(from, currency)}. Over a year that's about ${money((item.amountMinor - from) * (item.cadence === "weekly" ? 52 : item.cadence === "yearly" ? 1 : 12), currency)} more. Worth a check?`,
						action: "See subscriptions",
						url: `${appUrl}/app/activity?view=insights`,
					}),
				});
			}
		}
	}

	/** "Netflix is due in 3 days", once per due date, from the person's reminder setting. */
	async function subscriptionReminders(
		userId: string,
		today: string,
	): Promise<void> {
		for (const s of (await deps.subscriptions?.()?.remindersFor(userId)) ??
			[]) {
			const days = daysUntil(s.nextDue, today);
			const when =
				days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
			await notifier.notify(userId, {
				kind: "subscription-due",
				group: "bills",
				dedupeKey: `sub:${s.id}:${s.nextDue}`,
				build: ({ money, appUrl }) => ({
					subject: `${s.name} is due ${when}`,
					preview: `${s.amountVaries ? "About " : ""}${money(s.amountMinor, s.currency)} on ${prettyDay(s.nextDue)}.`,
					heading: `${s.name} is due ${when}`,
					body: `${s.amountVaries ? "About " : ""}${money(s.amountMinor, s.currency)} on ${prettyDay(s.nextDue)}. It's already kept aside in your safe-to-spend. Once it's paid, tap Mark paid and it's logged for you.`,
					action: "Open subscriptions",
					url: `${appUrl}/app/subscriptions`,
				}),
			});
		}
	}

	/** On the 1st: everything due this month, worked out up front. */
	async function subscriptionMonth(
		userId: string,
		today: string,
	): Promise<void> {
		const o = await deps.subscriptions?.()?.overview(userId);
		if (!o || o.thisMonth.length === 0) return;
		const names = new Map(o.active.map((s) => [s.id, s.name]));
		await notifier.notify(userId, {
			kind: "subscriptions-month",
			group: "bills",
			dedupeKey: today.slice(0, 7),
			build: ({ money, appUrl }) => ({
				subject: `This month's subscriptions: ${money(o.thisMonthMinor, o.currency)}`,
				preview: `${o.thisMonth.length} payments, already kept aside.`,
				heading: "Your subscriptions this month",
				body: `${o.thisMonth.length} payments, ${money(o.thisMonthMinor, o.currency)} in all. It's already kept aside in your safe-to-spend, and you'll get a reminder before each one.`,
				rows: o.thisMonth.slice(0, 12).map((p) => ({
					label: `${prettyDay(p.day)}: ${names.get(p.subscriptionId) ?? "Subscription"}`,
					value: money(p.amountMinor, o.currency),
				})),
				action: "Open subscriptions",
				url: `${appUrl}/app/subscriptions`,
			}),
		});
	}

	async function warranties(userId: string, today: string): Promise<void> {
		for (const days of WARRANTY_NOTICE_DAYS) {
			const ending = await db
				.select()
				.from(warranty)
				.where(
					and(
						eq(warranty.userId, userId),
						gte(warranty.endsOn, today),
						lte(warranty.endsOn, addDays(today, days)),
					),
				);
			for (const w of ending)
				await notifier.notify(userId, {
					kind: "warranty-ending",
					group: "warranty",
					dedupeKey: `${w.id}:${days}`,
					build: ({ appUrl }) => ({
						subject: `Warranty ends soon: ${w.itemName}`,
						preview: `Cover ends ${prettyDay(w.endsOn)}.`,
						heading: `${w.itemName}: warranty ends ${prettyDay(w.endsOn)}`,
						body: "If anything's wrong with it, now is the time to claim. Your receipt is saved in Spendid.",
						action: "See warranty",
						url: `${appUrl}/app/plan`,
					}),
				});
		}
	}

	async function wrapped(userId: string, today: string): Promise<void> {
		const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`);
		d.setUTCMonth(d.getUTCMonth() - 1);
		const month = d.toISOString().slice(0, 7);
		const w = await deps.insights.wrapped(userId, month);
		if (w.count === 0) return;
		const name = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", {
			month: "long",
			timeZone: "UTC",
		});
		await notifier.notify(userId, {
			kind: "money-wrapped",
			group: "wrapped",
			dedupeKey: month,
			build: ({ money, appUrl }) => ({
				subject: `Your ${name}, wrapped ${w.personality.emoji}`,
				preview: `You were ${w.personality.title}.`,
				heading: `${name} wrapped: ${w.personality.title}`,
				body: `${w.personality.line} Tap through your month: where it went, your biggest day and your favourite place.`,
				rows: [
					{ label: "Spent", value: money(w.totalMinor, w.currency) },
					...(w.categories[0]
						? [{ label: "Most went to", value: w.categories[0].name }]
						: []),
					{ label: "No-spend days", value: String(w.noSpendDays) },
				],
				action: "Play my month",
				url: `${appUrl}/app/wrapped?month=${month}`,
			}),
		});
	}

	return {
		/** One pass over everyone. Errors for one person never stop the others. */
		async tick(at = new Date()): Promise<number> {
			const people = await db
				.select({
					id: user.id,
					timeZone: profile.timeZone,
					currency: profile.homeCurrency,
				})
				.from(user)
				.innerJoin(profile, eq(profile.userId, user.id))
				.where(
					and(
						ne(user.role, "admin"),
						isNotNull(profile.onboardedAt),
						sql`coalesce(${user.banned}, false) = false`,
					),
				);
			let ran = 0;
			for (const p of people) {
				const local = localParts(p.timeZone, at);
				const jobs: Promise<void>[] = [];
				if (local.weekday === 1 && local.hour === 8)
					jobs.push(weekly(p.id, p.timeZone, local.date, p.currency));
				if (local.hour === 9)
					jobs.push(
						bills(p.id, local.date, p.currency),
						subscriptionReminders(p.id, local.date),
						warranties(p.id, local.date),
					);
				if (local.day === 1 && local.hour === 8)
					jobs.push(subscriptionMonth(p.id, local.date));
				if (local.day === 1 && local.hour === 9)
					jobs.push(wrapped(p.id, local.date));
				if (jobs.length) {
					ran += 1;
					await Promise.allSettled(jobs);
				}
			}
			return ran;
		},
		/** For `make digests`: run every digest for one person right away, ignoring quiet hours. */
		async runAllFor(userId: string): Promise<void> {
			sendNow = true;
			const [p] = await db
				.select({ timeZone: profile.timeZone, currency: profile.homeCurrency })
				.from(profile)
				.where(eq(profile.userId, userId))
				.limit(1);
			if (!p) return;
			const local = localParts(p.timeZone);
			await Promise.allSettled([
				weekly(userId, p.timeZone, local.date, p.currency),
				bills(userId, local.date, p.currency),
				subscriptionReminders(userId, local.date),
				subscriptionMonth(userId, local.date),
				warranties(userId, local.date),
				wrapped(userId, local.date),
			]);
			sendNow = false;
		},
	};
}

export type Digests = ReturnType<typeof createDigests>;
