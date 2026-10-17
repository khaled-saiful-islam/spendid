import {
	budget,
	category,
	createDb,
	notificationPref,
	profile,
	transaction,
	user,
} from "@spendid/db";
import type { EmailJob } from "@spendid/emails";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../test/db";
import { buildApp } from "../app";
import type { SessionLookup } from "../auth/guards";
import { seedCategories } from "../scripts/categories";
import { createMoneyAlerts } from "./alerts";
import { createNotifier, localParts } from "./notifier";
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
			notify: { session, notifier, links },
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
