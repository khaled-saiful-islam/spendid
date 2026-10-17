import { createDb, fxRate, split as splitTable, user } from "@spendid/db";
import type { EmailJob } from "@spendid/emails";
import type {
	Category,
	FamilyOverview,
	Goal,
	InviteCreated,
	InvitePreview,
	PulseItem,
	SharedView,
	SplitDto,
} from "@spendid/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { buildApp } from "../../app";
import type { SessionLookup } from "../../auth/guards";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "../money/categories.repository";
import { createFxRepository } from "../money/fx.repository";
import { createPlanRepository } from "../money/plan.repository";
import { createSummaryService } from "../money/summary.service";
import { createTransactionRepository } from "../money/transactions.repository";
import { createTransactionService } from "../money/transactions.service";
import { createFamilyRepository } from "./family.repository";
import { createFamilyService } from "./family.service";
import type { JarsOverview } from "./jars.service";
import { createJarsService } from "./jars.service";
import { createPulseService } from "./pulse.service";
import { createSplitService } from "./split.service";

const url = testDbUrl();

describe.skipIf(!url)("family circle (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 4);
	const db = database.db;
	let app: FastifyInstance;
	let maya: string;
	let adam: string;
	let stranger: string;
	let admin: string;
	let food: Category;
	const emails: EmailJob[] = [];
	const events: { userId: string; event: unknown }[] = [];

	const session: SessionLookup = async (headers) => {
		const id = headers.get("x-test-user");
		if (!id) return null;
		return {
			id,
			name: "T",
			email: "t@test.local",
			emailVerified: true,
			role: id === admin ? "admin" : "user",
		};
	};
	const call = async <T>(
		userId: string | null,
		method: "GET" | "PUT" | "POST" | "DELETE",
		path: string,
		payload?: object,
	) => {
		const res = await app.inject({
			method,
			url: `/api${path}`,
			headers: userId ? { "x-test-user": userId } : {},
			payload,
		});
		return {
			status: res.statusCode,
			body: res.json() as { success: boolean; data: T; error?: string },
		};
	};
	// Unique per run: the test database keeps earlier runs' people.
	const adamEmail = () => `adam-${adam}@example.com`;
	const tokenOf = (invite: InviteCreated) =>
		invite.url.split("/join/")[1] ?? "";
	const spend = (
		userId: string,
		amountMinor: number,
		merchant: string,
		note = "secret note",
	) =>
		call(userId, "POST", "/transactions", {
			amountMinor,
			currency: "MYR",
			categoryId: food.id,
			merchant,
			note,
		});

	beforeAll(async () => {
		await seedCategories(db);
		await db
			.insert(fxRate)
			.values({
				day: new Date().toISOString().slice(0, 10),
				currency: "MYR",
				perEur: "4.5757",
			})
			.onConflictDoNothing();
		maya = await createPerson(db);
		adam = await createPerson(db);
		stranger = await createPerson(db);
		admin = await createPerson(db, { role: "admin" });
		await db.update(user).set({ name: "Maya" }).where(eq(user.id, maya));
		await db
			.update(user)
			.set({ name: "Adam", email: adamEmail() })
			.where(eq(user.id, adam));

		const publish = async (userId: string, event: unknown) => {
			events.push({ userId, event });
			return 1;
		};
		const repo = createFamilyRepository(db);
		const categories = createCategoryRepository(db);
		const transactions = createTransactionRepository(db);
		const familyDeps = { db, repo, publish };
		app = await buildApp({
			checks: { database: database.ping, redis: async () => true },
			money: {
				session,
				categories,
				transactions,
				transactionService: createTransactionService({
					db,
					transactions,
					categories,
					fx: createFxRepository(db),
					onChange: async (ownerId) => {
						for (const id of await repo.expenseViewers(ownerId))
							await publish(id, { type: "family", what: "pulse" });
					},
				}),
				summary: createSummaryService(db),
				plan: createPlanRepository(db),
			},
			family: {
				session,
				family: createFamilyService({
					...familyDeps,
					sendEmail: async (job) => {
						emails.push(job);
					},
					appUrl: "http://spendid.test",
					receiptImage: async () => ({
						bytes: Buffer.from("x"),
						mime: "image/jpeg",
					}),
					allowEmail: async () => true,
				}),
				pulse: createPulseService(familyDeps),
				jars: createJarsService(familyDeps),
				splits: createSplitService({
					...familyDeps,
					appUrl: "http://spendid.test",
				}),
			},
		});
		const cats = await call<Category[]>(maya, "GET", "/categories");
		const found = cats.body.data.find((c) => c.slug === "food");
		if (!found) throw new Error("food category missing");
		food = found;
		await spend(maya, 1800, "Tealive");
	});

	afterAll(async () => {
		await app?.close();
		await database.close();
	});

	it("needs both people to say yes, and shows the invite without any money", async () => {
		const created = await call<InviteCreated>(maya, "POST", "/family/invites", {
			relation: "parent",
			level: "totals",
			email: adamEmail(),
		});
		expect(created.status).toBe(201);
		expect(emails.at(-1)).toMatchObject({
			type: "family-invite",
			to: adamEmail(),
			inviterName: "Maya",
		});
		const token = tokenOf(created.body.data);

		const preview = await call<InvitePreview>(
			null,
			"GET",
			`/family/invites/${token}`,
		);
		expect(preview.body.data).toMatchObject({
			inviterName: "Maya",
			relation: "parent",
			level: "totals",
			state: "ok",
		});
		expect(JSON.stringify(preview.body.data)).not.toMatch(/1800|Tealive/);

		const own = await call(maya, "POST", `/family/invites/${token}/accept`, {
			level: "totals",
		});
		expect(own.status).toBe(400);

		// Sent to Adam's email: someone else holding the link can't use it.
		const forwarded = await call<InvitePreview>(
			stranger,
			"GET",
			`/family/invites/${token}`,
		);
		expect(forwarded.body.data.state).toBe("someone-else");
		const taken = await call(
			stranger,
			"POST",
			`/family/invites/${token}/accept`,
			{
				level: "totals",
			},
		);
		expect(taken.status).toBe(403);

		const before = await call<FamilyOverview>(adam, "GET", "/family");
		expect(before.body.data.people).toHaveLength(0);

		const accepted = await call(
			adam,
			"POST",
			`/family/invites/${token}/accept`,
			{ level: "categories" },
		);
		expect(accepted.status).toBe(200);
		expect(emails.at(-1)).toMatchObject({
			type: "family-joined",
			joinerName: "Adam",
		});

		const again = await call(
			stranger,
			"POST",
			`/family/invites/${token}/accept`,
			{ level: "totals" },
		);
		expect(again.status).toBe(400);

		const mine = await call<FamilyOverview>(maya, "GET", "/family");
		expect(mine.body.data.people).toMatchObject([
			{
				userId: adam,
				name: "Adam",
				relation: "parent",
				iShare: { level: "totals" },
				theyShare: { level: "categories" },
			},
		]);
		const theirs = await call<FamilyOverview>(adam, "GET", "/family");
		expect(theirs.body.data.people[0]).toMatchObject({
			userId: maya,
			relation: "child",
		});
		expect(mine.body.data.invites).toHaveLength(0);
	});

	it("shows only what the level allows, and the owner's preview is identical", async () => {
		const totals = await call<SharedView>(
			adam,
			"GET",
			`/family/people/${maya}/view`,
		);
		expect(totals.body.data.month?.spentMinor).toBe(1800);
		expect(totals.body.data.categories).toBeNull();
		expect(totals.body.data.expenses).toBeNull();

		events.length = 0;
		await call(maya, "PUT", `/family/people/${adam}/share`, {
			level: "transactions",
			paused: false,
		});
		expect(events).toContainEqual({
			userId: adam,
			event: expect.objectContaining({ what: "share" }),
		});

		const view = await call<SharedView>(
			adam,
			"GET",
			`/family/people/${maya}/view`,
		);
		const preview = await call<SharedView>(
			maya,
			"GET",
			`/family/people/${adam}/preview`,
		);
		expect(view.body.data).toEqual(preview.body.data);
		expect(view.body.data.expenses?.[0]).toMatchObject({
			merchant: "Tealive",
			amountMinor: 1800,
			receiptId: null,
		});
		expect(JSON.stringify(view.body.data)).not.toContain("secret note");

		const outsider = await call(stranger, "GET", `/family/people/${maya}/view`);
		expect(outsider.status).toBe(404);
	});

	it("pause hides everything at once", async () => {
		await call(maya, "PUT", `/family/people/${adam}/share`, {
			level: "transactions",
			paused: true,
		});
		const view = await call<SharedView>(
			adam,
			"GET",
			`/family/people/${maya}/view`,
		);
		expect(view.body.data).toMatchObject({
			paused: true,
			month: null,
			expenses: null,
		});
		const pulse = await call<PulseItem[]>(adam, "GET", "/family/pulse");
		expect(pulse.body.data.some((p) => p.kind === "expense")).toBe(false);
		await call(maya, "PUT", `/family/people/${adam}/share`, {
			level: "transactions",
			paused: false,
		});
	});

	it("streams new expenses to the pulse and lets family cheer", async () => {
		events.length = 0;
		await spend(maya, 4200, "Jaya Grocer");
		await new Promise((r) => setTimeout(r, 50));
		expect(events).toContainEqual({
			userId: adam,
			event: { type: "family", what: "pulse" },
		});

		const pulse = await call<PulseItem[]>(adam, "GET", "/family/pulse");
		const item = pulse.body.data.find(
			(p) => p.kind === "expense" && p.title === "Jaya Grocer",
		);
		expect(item).toMatchObject({
			actorName: "Maya",
			amountMinor: 4200,
			mine: false,
		});
		if (!item) return;

		const cheer = await call(adam, "POST", "/family/reactions", {
			kind: "expense",
			targetId: item.id,
			emoji: "👏",
		});
		expect(cheer.status).toBe(200);
		const self = await call(maya, "POST", "/family/reactions", {
			kind: "expense",
			targetId: item.id,
			emoji: "👏",
		});
		expect(self.status).toBe(400);

		const mine = await call<PulseItem[]>(maya, "GET", "/family/pulse");
		const same = mine.body.data.find((p) => p.id === item.id);
		expect(same?.reactions).toEqual([
			{ emoji: "👏", count: 1, mine: false, names: ["Adam"] },
		]);

		const outsider = await call(stranger, "POST", "/family/reactions", {
			kind: "expense",
			targetId: item.id,
			emoji: "😂",
		});
		expect(outsider.status).toBe(404);
	});

	it("fills a shared jar together", async () => {
		const goal = await call<Goal>(maya, "POST", "/goals", {
			name: "Langkawi trip",
			emoji: "🏝️",
			targetMinor: 100_000,
		});
		const id = goal.body.data.id;
		const blocked = await call(maya, "PUT", `/family/jars/${id}/members`, {
			userIds: [stranger],
		});
		expect(blocked.status).toBe(400);
		await call(maya, "PUT", `/family/jars/${id}/members`, { userIds: [adam] });

		const put = await call(adam, "POST", `/family/jars/${id}/deposit`, {
			amountMinor: 5000,
		});
		expect(put.status).toBe(200);
		const take = await call(adam, "POST", `/family/jars/${id}/deposit`, {
			amountMinor: -100,
		});
		expect(take.status).toBe(400);
		await call(maya, "POST", `/goals/${id}/deposit`, { amountMinor: 2000 });

		const jars = await call<JarsOverview>(adam, "GET", "/family/jars");
		const jar = jars.body.data.jars.find((j) => j.id === id);
		expect(jar).toMatchObject({
			savedMinor: 7000,
			mine: false,
			ownerName: "Maya",
		});
		expect(jar?.members).toEqual([
			{ userId: maya, name: "Maya", givenMinor: 2000 },
			{ userId: adam, name: "Adam", givenMinor: 5000 },
		]);

		// Taking out more than the jar holds is refused, so who-gave-what still adds up.
		const tooMuch = await call(maya, "POST", `/family/jars/${id}/deposit`, {
			amountMinor: -9000,
		});
		expect(tooMuch.status).toBe(400);
		const tooMuchGoal = await call(maya, "POST", `/goals/${id}/deposit`, {
			amountMinor: -9000,
		});
		expect(tooMuchGoal.status).toBe(400);
		const after = (
			await call<JarsOverview>(adam, "GET", "/family/jars")
		).body.data.jars.find((j) => j.id === id);
		expect(after?.savedMinor).toBe(7000);
		expect(after?.members.reduce((n, m) => n + m.givenMinor, 0)).toBe(7000);
		const outsider = await call(
			stranger,
			"POST",
			`/family/jars/${id}/deposit`,
			{ amountMinor: 100 },
		);
		expect(outsider.status).toBe(404);
	});

	it("splits a bill fairly and shares a read-only link", async () => {
		const created = await call<SplitDto>(maya, "POST", "/splits", {
			title: "Dinner at Madam Kwan's",
			currency: "MYR",
			people: [
				{ key: "me", name: "Maya", userId: maya },
				{ key: "adam", name: "Adam", userId: adam },
				{ key: "sam", name: "Sam", userId: null },
			],
			items: [
				{ key: "1", name: "Nasi lemak", amountMinor: 2200, people: ["me"] },
				{
					key: "2",
					name: "Satay",
					amountMinor: 3000,
					people: ["me", "adam", "sam"],
				},
			],
			adjustMinor: 520,
		});
		expect(created.status).toBe(201);
		const split = created.body.data;
		expect(split.result.shares.reduce((a, s) => a + s.totalMinor, 0)).toBe(
			5720,
		);
		expect(
			events.some(
				(e) =>
					e.userId === adam && JSON.stringify(e.event).includes("your share"),
			),
		).toBe(true);

		const token = split.url?.split("/split/")[1] ?? "";
		const open = await call<SplitDto>(null, "GET", `/splits/public/${token}`);
		expect(open.status).toBe(200);
		expect(open.body.data.url).toBeNull();
		expect(open.body.data.people.every((p) => p.userId === null)).toBe(true);

		const withMe = await call<SplitDto[]>(adam, "GET", "/splits/with-me");
		expect(withMe.body.data.map((s) => s.id)).toContain(split.id);
		const paid = await call<SplitDto>(maya, "PUT", `/splits/${split.id}/paid`, {
			key: "adam",
			paid: true,
		});
		expect(paid.body.data.paid).toEqual(["adam"]);

		// The read-only link ends after a while; the split itself stays for its people.
		await db
			.update(splitTable)
			.set({ createdAt: new Date(Date.now() - 61 * 86_400_000) })
			.where(eq(splitTable.id, split.id));
		const old = await call(null, "GET", `/splits/public/${token}`);
		expect(old.status).toBe(410);
		const stillMine = await call<SplitDto[]>(adam, "GET", "/splits/with-me");
		expect(stillMine.body.data.map((s) => s.id)).toContain(split.id);
	});

	it("keeps admins out", async () => {
		const res = await call(admin, "GET", "/family");
		expect(res.status).toBe(403);
	});

	it("stop ends it for both and tells the other person", async () => {
		emails.length = 0;
		const res = await call(adam, "DELETE", `/family/people/${maya}`);
		expect(res.status).toBe(200);
		expect(emails.at(-1)).toMatchObject({
			type: "family-share-changed",
			userId: maya,
		});
		const mine = await call<FamilyOverview>(maya, "GET", "/family");
		expect(mine.body.data.people).toHaveLength(0);
		const view = await call(adam, "GET", `/family/people/${maya}/view`);
		expect(view.status).toBe(404);
		const jars = await call<JarsOverview>(adam, "GET", "/family/jars");
		expect(jars.body.data.jars).toHaveLength(0);
	});
});
