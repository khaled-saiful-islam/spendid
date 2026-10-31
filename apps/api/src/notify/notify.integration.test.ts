import {
	budget,
	category,
	createDb,
	notificationPref,
	payCycle,
	profile,
	transaction,
	user,
} from "@spendid/db";
import type { EmailJob } from "@spendid/emails";
import { addDays, formatMinor } from "@spendid/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../test/db";
import { buildApp } from "../app";
import type { SessionLookup } from "../auth/guards";
import { createInsightsService } from "../modules/insights/insights.service";
import { createSummaryService } from "../modules/money/summary.service";
import { seedCategories } from "../scripts/categories";
import { createMoneyAlerts } from "./alerts";
import { createDigests } from "./digests";
import { createNotifier, localParts } from "./notifier";
import { createPush } from "./push";
import { createSecurityAlerts } from "./security";
import { createUnsubscribeLinks } from "./unsubscribe";

const url = testDbUrl();
const SECRET = "test-secret-test-secret-test-secret-123";
const CHROME_MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";
const SAFARI_IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

describe.skipIf(!url)("email notifications (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 4);
	const db = database.db;
	const sent: { job: EmailJob; delayMs: number }[] = [];
	const links = createUnsubscribeLinks(SECRET, "http://spendid.test");
	const notifier = createNotifier({
		db,
		links,
		appUrl: "http://spendid.test",
		sendEmail: async (job, opts) => {
			sent.push({ job, delayMs: opts?.delayMs ?? 0 });
		},
	});
	const alerts = createMoneyAlerts({ db, notifier });
	const security = createSecurityAlerts({ db, notifier });
	let app: FastifyInstance;
	let maya: string;
	let admin: string;
	let food: string;

	const session: SessionLookup = async (headers) => {
		const id = headers.get("x-test-user");
		return id
			? {
					id,
					name: "T",
					email: "t@test.local",
					emailVerified: true,
					role: id === admin ? "admin" : "user",
				}
			: null;
	};
	const notice = (dedupeKey?: string) => ({
		kind: "weekly-summary" as const,
		group: "weekly" as const,
		dedupeKey,
		build: ({ money }: { money: (m: number, c: string) => string }) => ({
			subject: `You spent ${money(41200, "MYR")}`,
			preview: "p",
			heading: "h",
			body: "b",
			rows: [{ label: "Spent", value: money(41200, "MYR") }],
			action: "Open",
			url: "http://spendid.test/app",
		}),
	});
	const spend = async (minor: number, merchant: string) => {
		const [row] = await db
			.insert(transaction)
			.values({
				userId: maya,
				amountMinor: minor,
				currency: "MYR",
				homeAmountMinor: minor,
				homeCurrency: "MYR",
				categoryId: food,
				merchant,
				occurredAt: new Date(),
			})
			.returning({ id: transaction.id });
		return row?.id ?? "";
	};

	beforeAll(async () => {
		await seedCategories(db);
		maya = await createPerson(db);
		admin = await createPerson(db, { role: "admin" });
		await db.update(user).set({ name: "Maya" }).where(eq(user.id, maya));
		const [cat] = await db
			.select({ id: category.id })
			.from(category)
			.where(eq(category.slug, "food"))
			.limit(1);
		food = cat?.id ?? "";
		app = await buildApp({
			checks: { database: database.ping, redis: async () => true },
			notify: {
				session,
				notifier,
				links,
				push: createPush({
					db,
					publicKey: "BTestPublicKey",
					privateKey: "test",
					subject: "mailto:test@spendid.test",
					sender: async () => {},
				}),
			},
		});
	});
	beforeEach(() => {
		sent.length = 0;
	});
	afterAll(async () => {
		await app?.close();
		await database.close();
	});

	it("sends once per key, with an unsubscribe link, and never optional emails to admins", async () => {
		expect(await notifier.notify(maya, notice("w1"))).toBe("sent");
		expect(await notifier.notify(maya, notice("w1"))).toBe("already");
		expect(sent).toHaveLength(1);
		expect(sent[0]?.job).toMatchObject({
			type: "notice",
			kind: "weekly-summary",
			name: "Maya",
			subject: "You spent RM 412.00",
		});
		expect(sent[0]?.job.unsubscribeUrl).toContain("/unsubscribe?u=");
		expect(await notifier.notify(admin, notice("w1"))).toBe("nobody");
	});

	it("puts every alert in the in-app inbox too, once, even when its email is off", async () => {
		const kim = await createPerson(db);
		const live: string[] = [];
		const withInbox = createNotifier({
			db,
			links,
			appUrl: "http://spendid.test",
			sendEmail: async () => {},
			publish: async (userId) => {
				live.push(userId);
			},
		});
		expect(await withInbox.notify(kim, notice("in-1"))).toBe("sent");
		expect(await withInbox.notify(kim, notice("in-1"))).toBe("already");
		await withInbox.setPrefs(kim, { weekly: false });
		expect(await withInbox.notify(kim, notice("in-2"))).toBe("off");
		expect(live).toEqual([kim, kim]);

		const read = async () =>
			(
				await app.inject({
					method: "GET",
					url: "/api/notices",
					headers: { "x-test-user": kim },
				})
			).json() as {
				data: {
					unread: number;
					items: { title: string; path: string | null }[];
				};
			};
		const inbox = (await read()).data;
		expect(inbox.unread).toBe(2);
		expect(inbox.items).toHaveLength(2);
		expect(inbox.items[0]).toMatchObject({
			title: "You spent RM 412.00",
			path: "/app",
		});
		await app.inject({
			method: "POST",
			url: "/api/notices/read",
			headers: { "x-test-user": kim },
		});
		expect((await read()).data.unread).toBe(0);
		// Someone else's inbox is empty.
		const other = await app.inject({
			method: "GET",
			url: "/api/notices",
			headers: { "x-test-user": maya },
		});
		expect(
			(other.json() as { data: { items: unknown[] } }).data.items.every(
				(i) => (i as { title: string }).title !== undefined,
			),
		).toBe(true);
	});

	it("buzzes the phone when the email goes out, but not when that email is off", async () => {
		const pia = await createPerson(db);
		const buzzed: { title: string; path: string | null }[] = [];
		const withPush = createNotifier({
			db,
			links,
			appUrl: "http://spendid.test",
			sendEmail: async () => {},
			push: {
				deliver: async (_userId, message) => {
					buzzed.push({ title: message.title, path: message.path });
					return 1;
				},
			},
		});
		// Quiet hours off, so the test doesn't depend on the clock.
		await withPush.setPrefs(pia, { quietStart: 0, quietEnd: 0 });
		expect(await withPush.notify(pia, notice("push-1"))).toBe("sent");
		expect(buzzed).toEqual([{ title: "You spent RM 412.00", path: "/app" }]);
		await withPush.setPrefs(pia, { weekly: false });
		expect(await withPush.notify(pia, notice("push-2"))).toBe("off");
		expect(buzzed).toHaveLength(1);
	});

	it("nudges reach the bell and the phone, never email, with the switch and quiet hours", async () => {
		const kai = await createPerson(db);
		const buzzed: string[] = [];
		const emailed: unknown[] = [];
		const n = createNotifier({
			db,
			links,
			appUrl: "http://spendid.test",
			sendEmail: async (job) => {
				emailed.push(job);
			},
			push: {
				deliver: async (_userId, message) => {
					buzzed.push(message.title);
					return 1;
				},
			},
		});
		await n.setPrefs(kai, { quietStart: 0, quietEnd: 0 });
		const cheer = (key: string) => ({
			kind: "family-cheer" as const,
			group: "family" as const,
			dedupeKey: key,
			build: ({ money }: { money: (m: number, c: string) => string }) => ({
				title: "Adam cheered 👏 your lunch",
				body: `Lunch, ${money(1250, "MYR")}`,
				url: "http://spendid.test/app/family",
			}),
		});
		expect(await n.nudge(kai, cheer("c1"))).toBe("sent");
		expect(await n.nudge(kai, cheer("c1"))).toBe("already");
		expect(buzzed).toEqual(["Adam cheered 👏 your lunch"]);
		expect(emailed).toHaveLength(0);
		expect((await n.inbox(kai)).items[0]).toMatchObject({
			kind: "family-cheer",
			title: "Adam cheered 👏 your lunch",
			body: "Lunch, RM 12.50",
			path: "/app/family",
		});
		// Family switched off: the bell keeps it, the phone stays quiet.
		await n.setPrefs(kai, { family: false });
		expect(await n.nudge(kai, cheer("c2"))).toBe("off");
		expect(buzzed).toHaveLength(1);
		expect((await n.inbox(kai)).items).toHaveLength(2);
		// Quiet hours: the same.
		const hour = localParts("Asia/Kuala_Lumpur").hour;
		await n.setPrefs(kai, {
			family: true,
			hideAmounts: true,
			quietStart: hour,
			quietEnd: (hour + 2) % 24,
		});
		expect(await n.nudge(kai, cheer("c3"))).toBe("sent");
		expect(buzzed).toHaveLength(1);
		expect((await n.inbox(kai)).items[0]?.body).toBe("Lunch, RM •••");
	});

	it("the evening nudge is off until it's switched on, then says how today went", async () => {
		const ria = await createPerson(db);
		const buzzed: { title: string; body: string }[] = [];
		const n = createNotifier({
			db,
			links,
			appUrl: "http://spendid.test",
			sendEmail: async () => {},
			push: {
				deliver: async (_userId, message) => {
					buzzed.push({ title: message.title, body: message.body });
					return 1;
				},
			},
		});
		const digests = createDigests({
			db,
			notifier: n,
			summary: createSummaryService(db),
			insights: createInsightsService(db),
			logError: () => {},
		});
		const today = localParts("Asia/Kuala_Lumpur").date;
		await n.setPrefs(ria, { quietStart: 0, quietEnd: 0 });
		expect((await n.prefs(ria)).eveningNudge).toBe(false);
		await digests.evening(ria, today, "MYR");
		expect(buzzed).toHaveLength(0);

		await n.setPrefs(ria, { eveningNudge: true });
		await digests.evening(ria, today, "MYR");
		expect(buzzed.at(-1)).toEqual({
			title: "Nothing logged today",
			body: "Spent anything? Add it in a few seconds.",
		});

		const rib = await createPerson(db);
		await n.setPrefs(rib, { quietStart: 0, quietEnd: 0, eveningNudge: true });
		await db.insert(transaction).values(
			[1250, 680, 2270].map((minor) => ({
				userId: rib,
				categoryId: food,
				merchant: "Kopi",
				amountMinor: minor,
				currency: "MYR",
				homeAmountMinor: minor,
				homeCurrency: "MYR",
				occurredAt: new Date(),
			})),
		);
		await digests.evening(rib, today, "MYR");
		expect(buzzed.at(-1)).toEqual({
			title: "Today: RM 42.00 over 3 expenses",
			body: "Anything else to add before bed?",
		});
		// Once a day.
		await digests.evening(rib, today, "MYR");
		expect(buzzed).toHaveLength(2);
	});

	it("the morning summary: yesterday's spending and how the period is going, on by default", async () => {
		const buzzed: { title: string; body: string }[] = [];
		const n = createNotifier({
			db,
			links,
			appUrl: "http://spendid.test",
			sendEmail: async () => {},
			push: {
				deliver: async (_userId, message) => {
					buzzed.push({ title: message.title, body: message.body });
					return 1;
				},
			},
		});
		const summary = createSummaryService(db);
		const digests = createDigests({
			db,
			notifier: n,
			summary,
			insights: createInsightsService(db),
			logError: () => {},
		});
		const local = localParts("Asia/Kuala_Lumpur");
		const today = local.date;
		const yesterday = addDays(today, -1);
		const at = (day: string, time = "12:00") =>
			new Date(`${day}T${time}:00+08:00`);
		const rm = (minor: number) => formatMinor(minor, "MYR");
		const spend = (
			userId: string,
			minor: number,
			when: Date,
			deletedAt: Date | null = null,
		) => ({
			userId,
			categoryId: food,
			merchant: "Kopi",
			amountMinor: minor,
			currency: "MYR",
			homeAmountMinor: minor,
			homeCurrency: "MYR",
			occurredAt: when,
			deletedAt,
		});
		const onCycle = async (userId: string, incomeMinor: number) => {
			await db
				.update(profile)
				.set({ period: "cycle" })
				.where(eq(profile.userId, userId));
			await db.insert(payCycle).values({
				userId,
				startsOn: addDays(today, -5),
				endsOn: addDays(today, 24),
				incomeMinor,
			});
		};

		// A cycle: yesterday's two expenses (local days, deleted ones never count), and the
		// cycle so far with the same numbers as Home.
		const kim = await createPerson(db);
		expect((await n.prefs(kim)).morningRecap).toBe(true);
		await n.setPrefs(kim, { quietStart: 0, quietEnd: 0 });
		await onCycle(kim, 300_000);
		await db
			.insert(transaction)
			.values([
				spend(kim, 1250, at(yesterday, "00:00")),
				spend(kim, 680, at(yesterday, "23:59")),
				spend(kim, 5000, at(yesterday), new Date()),
				spend(kim, 999, at(addDays(today, -2), "23:59")),
				spend(kim, 300, at(today, "00:00")),
			]);
		await digests.morning(kim, today, "MYR");
		const kimSummary = await summary.forUser(kim);
		expect(kimSummary.monthSpentMinor).toBe(1250 + 680 + 999 + 300);
		expect(buzzed.at(-1)).toEqual({
			title: "Yesterday: RM 19.30 on 2 expenses",
			body: `This cycle so far: ${rm(3229)} spent, ${rm(kimSummary.safe.leftThisMonthMinor)} left.`,
		});
		expect((await n.inbox(kim)).items[0]?.title).toBe(
			"Yesterday: RM 19.30 on 2 expenses",
		);
		// Once a day.
		await digests.morning(kim, today, "MYR");
		expect(buzzed).toHaveLength(1);

		// Over the cycle's salary: says how much over.
		const ned = await createPerson(db);
		await n.setPrefs(ned, { quietStart: 0, quietEnd: 0 });
		await onCycle(ned, 1_000);
		await db.insert(transaction).values([spend(ned, 1930, at(yesterday))]);
		await digests.morning(ned, today, "MYR");
		const nedLeft = (await summary.forUser(ned)).safe.leftThisMonthMinor;
		expect(nedLeft).toBeLessThan(0);
		expect(buzzed.at(-1)).toEqual({
			title: "Yesterday: RM 19.30 on 1 expense",
			body: `This cycle so far: ${rm(1930)} spent, ${rm(-nedLeft)} over.`,
		});

		// Calendar month.
		const ola = await createPerson(db);
		await n.setPrefs(ola, { quietStart: 0, quietEnd: 0 });
		await db.insert(transaction).values([spend(ola, 800, at(yesterday))]);
		await digests.morning(ola, today, "MYR");
		const olaSummary = await summary.forUser(ola);
		expect(buzzed.at(-1)).toEqual({
			title: "Yesterday: RM 8.00 on 1 expense",
			body: `This month so far: ${rm(olaSummary.monthSpentMinor)} spent, ${rm(olaSummary.safe.leftThisMonthMinor)} left.`,
		});

		// No income set: just what was spent.
		const ivy = await createPerson(db);
		await n.setPrefs(ivy, { quietStart: 0, quietEnd: 0 });
		await db
			.update(profile)
			.set({ monthlyIncomeMinor: null })
			.where(eq(profile.userId, ivy));
		await db.insert(transaction).values([spend(ivy, 800, at(yesterday))]);
		await digests.morning(ivy, today, "MYR");
		const ivySpent = (await summary.forUser(ivy)).monthSpentMinor;
		expect(buzzed.at(-1)).toEqual({
			title: "Yesterday: RM 8.00 on 1 expense",
			body: `This month so far: ${rm(ivySpent)} spent.`,
		});

		// Nothing yesterday.
		const lea = await createPerson(db);
		await n.setPrefs(lea, { quietStart: 0, quietEnd: 0 });
		await digests.morning(lea, today, "MYR");
		expect(buzzed.at(-1)).toEqual({
			title: "Nothing logged yesterday",
			body: "Spent anything? Add it now.",
		});
		const sent = buzzed.length;

		// Switched off: nothing.
		const max = await createPerson(db);
		await n.setPrefs(max, {
			quietStart: 0,
			quietEnd: 0,
			morningRecap: false,
		});
		await digests.morning(max, today, "MYR");
		expect(buzzed).toHaveLength(sent);
		expect((await n.inbox(max)).items).toHaveLength(0);

		// In quiet hours it waits for a later hour instead of being lost.
		const quinn = await createPerson(db);
		await n.setPrefs(quinn, {
			quietStart: local.hour,
			quietEnd: (local.hour + 2) % 24,
		});
		await digests.morning(quinn, today, "MYR");
		expect(buzzed).toHaveLength(sent);
		expect((await n.inbox(quinn)).items).toHaveLength(0);
		await n.setPrefs(quinn, { quietStart: 0, quietEnd: 0 });
		await digests.morning(quinn, today, "MYR");
		expect(buzzed).toHaveLength(sent + 1);
	});

	it("reminds a cycle user on the cycle's last day, once, and nobody else", async () => {
		const digests = createDigests({
			db,
			notifier,
			summary: createSummaryService(db),
			insights: createInsightsService(db),
			logError: () => {},
		});
		const today = localParts("Asia/Kuala_Lumpur").date;
		const onCycle = async (startsOn: string, endsOn: string) => {
			const id = await createPerson(db);
			await db
				.update(profile)
				.set({ period: "cycle" })
				.where(eq(profile.userId, id));
			await db
				.insert(payCycle)
				.values({ userId: id, startsOn, endsOn, incomeMinor: 450_000 });
			return id;
		};
		const ending = await onCycle(addDays(today, -30), today);
		const early = await onCycle(addDays(today, -3), addDays(today, 27));
		const sam = await createPerson(db);

		for (const id of [ending, ending, early, sam])
			await digests.cycleEnding(id, today);

		const reminders = sent.filter(
			(s) => s.job.type === "notice" && s.job.kind === "cycle-ending",
		);
		expect(reminders).toHaveLength(1);
		expect(reminders[0]?.job.to).toBe(`${ending}@test.local`);
	});

	it("the weekly email names the cycle for a cycle user's bills", async () => {
		const digests = createDigests({
			db,
			notifier,
			summary: createSummaryService(db),
			insights: createInsightsService(db),
			logError: () => {},
		});
		const today = localParts("Asia/Kuala_Lumpur").date;
		const wk = await createPerson(db);
		await db
			.update(profile)
			.set({ period: "cycle" })
			.where(eq(profile.userId, wk));
		await db.insert(payCycle).values({
			userId: wk,
			startsOn: addDays(today, -3),
			endsOn: addDays(today, 27),
			incomeMinor: 450_000,
		});
		await digests.weekly(wk, "Asia/Kuala_Lumpur", today, "MYR");
		const job = sent.find(
			(s) => s.job.type === "notice" && s.job.kind === "weekly-summary",
		)?.job;
		const labels = JSON.stringify(job);
		expect(labels).toContain("Bills still due this cycle");
		expect(labels).not.toContain("Bills still due this month");
	});

	it("lets a phone turn notifications on, test them and turn them off", async () => {
		const zoe = await createPerson(db);
		const as = { "x-test-user": zoe };
		const key = await app.inject({
			method: "GET",
			url: "/api/push/key",
			headers: as,
		});
		expect(key.json()).toMatchObject({ data: { publicKey: "BTestPublicKey" } });
		const device = {
			endpoint: `https://fcm.googleapis.com/fcm/send/zoe-${Date.now()}`,
			keys: { p256dh: "p", auth: "a" },
		};
		const bad = await app.inject({
			method: "POST",
			url: "/api/push/subscribe",
			headers: as,
			payload: { endpoint: "not a url", keys: device.keys },
		});
		expect(bad.statusCode).toBe(400);
		// Only the browsers' push services: never an address inside the server's network.
		for (const endpoint of [
			"http://localhost:8601/api/admin",
			"https://169.254.169.254/latest/meta-data",
			"https://redis:6379/",
			"http://fcm.googleapis.com/fcm/send/x",
		]) {
			const res = await app.inject({
				method: "POST",
				url: "/api/push/subscribe",
				headers: as,
				payload: { endpoint, keys: device.keys },
			});
			expect(res.statusCode, endpoint).toBe(400);
		}
		await app.inject({
			method: "POST",
			url: "/api/push/subscribe",
			headers: as,
			payload: device,
		});
		const test = await app.inject({
			method: "POST",
			url: "/api/push/test",
			headers: as,
		});
		expect(test.json()).toMatchObject({ data: { delivered: 1 } });
		await app.inject({
			method: "POST",
			url: "/api/push/unsubscribe",
			headers: as,
			payload: { endpoint: device.endpoint },
		});
		const after = await app.inject({
			method: "POST",
			url: "/api/push/test",
			headers: as,
		});
		expect(after.json()).toMatchObject({ data: { delivered: 0 } });
	});

	it("doesn't double the in-app notice when the email is retried", async () => {
		const lee = await createPerson(db);
		let down = true;
		const flaky = createNotifier({
			db,
			links,
			appUrl: "http://spendid.test",
			sendEmail: async () => {
				if (down) throw new Error("redis down");
			},
		});
		await expect(flaky.notify(lee, notice("retry-in"))).rejects.toThrow();
		down = false;
		expect(await flaky.notify(lee, notice("retry-in"))).toBe("sent");
		expect((await flaky.inbox(lee)).items).toHaveLength(1);
	});

	it("tries again next time when the email couldn't be queued", async () => {
		let down = true;
		const flaky = createNotifier({
			db,
			links,
			appUrl: "http://spendid.test",
			sendEmail: async () => {
				if (down) throw new Error("redis down");
			},
		});
		await expect(flaky.notify(maya, notice("retry-1"))).rejects.toThrow();
		down = false;
		expect(await flaky.notify(maya, notice("retry-1"))).toBe("sent");
	});

	it("respects preferences, hidden amounts and quiet hours", async () => {
		await notifier.setPrefs(maya, { weekly: false });
		expect(await notifier.notify(maya, notice("w2"))).toBe("off");

		const hour = localParts("Asia/Kuala_Lumpur").hour;
		await notifier.setPrefs(maya, {
			weekly: true,
			hideAmounts: true,
			quietStart: hour,
			quietEnd: (hour + 2) % 24,
		});
		expect(await notifier.notify(maya, notice("w3"))).toBe("sent");
		const job = sent.at(-1);
		expect(job?.job).toMatchObject({ subject: "You spent RM •••" });
		expect(job?.delayMs).toBeGreaterThan(0);
		await db.delete(notificationPref).where(eq(notificationPref.userId, maya));
	});

	it("unsubscribes from a signed link, including one-click from mail apps", async () => {
		const link = new URL(links.url(maya, "bills"));
		const bad = await app.inject({
			method: "POST",
			url: "/api/email/unsubscribe",
			payload: { u: maya, g: "bills", t: "x".repeat(43) },
		});
		expect(bad.statusCode).toBe(400);
		const res = await app.inject({
			method: "POST",
			url: `/api/email/unsubscribe${link.search}`,
			headers: { "content-type": "application/x-www-form-urlencoded" },
			payload: "List-Unsubscribe=One-Click",
		});
		expect(res.statusCode).toBe(200);
		expect((await notifier.prefs(maya)).bills).toBe(false);
		const other = await app.inject({
			method: "POST",
			url: `/api/email/unsubscribe${link.search.replace("g=bills", "g=weekly")}`,
		});
		expect(other.statusCode).toBe(400);
	});

	it("alerts at 80% and 100% of a budget, once each", async () => {
		await db
			.update(profile)
			.set({ timeZone: "Asia/Kuala_Lumpur" })
			.where(eq(profile.userId, maya));
		await db
			.insert(budget)
			.values({ userId: maya, categoryId: food, monthlyLimitMinor: 10_000 });
		await alerts.afterExpense(maya, await spend(8_500, "Nasi lemak"));
		await alerts.afterExpense(maya, await spend(500, "Teh tarik"));
		await alerts.afterExpense(maya, await spend(1_500, "Roti canai"));
		const kinds = sent
			.filter((s) => s.job.type === "notice" && s.job.kind === "budget-alert")
			.map((s) => (s.job.type === "notice" ? s.job.subject : ""));
		expect(kinds).toEqual([
			"Eating out: 80% of your budget used",
			"Eating out: budget used up",
		]);
	});

	it("budget alerts follow the cycle", async () => {
		const cy = await createPerson(db);
		const today = localParts("Asia/Kuala_Lumpur").date;
		await db
			.update(profile)
			.set({ period: "cycle" })
			.where(eq(profile.userId, cy));
		await db.insert(payCycle).values({
			userId: cy,
			startsOn: addDays(today, -3),
			endsOn: addDays(today, 27),
			incomeMinor: 450_000,
		});
		await db
			.insert(budget)
			.values({ userId: cy, categoryId: food, monthlyLimitMinor: 10_000 });
		const row = (minor: number, merchant: string, occurredAt: Date) => ({
			userId: cy,
			amountMinor: minor,
			currency: "MYR",
			homeAmountMinor: minor,
			homeCurrency: "MYR",
			categoryId: food,
			merchant,
			occurredAt,
		});
		// RM 50 the day before the cycle doesn't count; RM 85 inside it is 85%.
		await db
			.insert(transaction)
			.values(row(5_000, "Old", new Date(`${addDays(today, -4)}T04:00:00Z`)));
		const [inside] = await db
			.insert(transaction)
			.values(row(8_500, "Nasi lemak", new Date()))
			.returning({ id: transaction.id });
		await alerts.afterExpense(cy, inside?.id ?? "");
		const jobs = sent.flatMap((s) =>
			s.job.type === "notice" && s.job.kind === "budget-alert" ? [s.job] : [],
		);
		expect(jobs.map((j) => j.subject)).toEqual([
			"Eating out: 80% of your budget used",
		]);
		expect(jobs[0]?.preview).toContain("with 28 days to go");
		expect(JSON.stringify(jobs[0])).toContain("this cycle's");
	});

	it("spots the same charge twice", async () => {
		await alerts.afterExpense(maya, await spend(4_590, "Unifi"));
		await alerts.afterExpense(maya, await spend(4_590, "Unifi"));
		expect(
			sent.some(
				(s) => s.job.type === "notice" && s.job.kind === "duplicate-charge",
			),
		).toBe(true);
	});

	it("emails about a new kind of device, not the first or a known one", async () => {
		await security.sessionCreated({ userId: maya, userAgent: CHROME_MAC });
		await security.sessionCreated({ userId: maya, userAgent: CHROME_MAC });
		expect(sent).toHaveLength(0);
		await security.sessionCreated({ userId: maya, userAgent: SAFARI_IPHONE });
		expect(sent[0]?.job).toMatchObject({
			kind: "new-sign-in",
			subject: "New sign-in to Spendid from Safari on iPhone",
		});
		expect(sent[0]?.delayMs).toBe(0);
		expect(sent[0]?.job.unsubscribeUrl).toBeUndefined();
	});
});
