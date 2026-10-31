import { createDb, payCycle, profile } from "@spendid/db";
import {
	addDays,
	type PlanPreview,
	type PlanSetup,
	type Summary,
} from "@spendid/shared";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { buildApp } from "../../app";
import type { SessionLookup } from "../../auth/guards";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "./categories.repository";
import { createFxRepository } from "./fx.repository";
import { createPlanRepository } from "./plan.repository";
import { createPlanSetupService } from "./plan-setup.service";
import { createSummaryService } from "./summary.service";
import { createTransactionRepository } from "./transactions.repository";
import { createTransactionService } from "./transactions.service";

const url = testDbUrl();

describe.skipIf(!url)("plan setup API (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 4);
	const db = database.db;
	let app: FastifyInstance;
	let admin: string;
	const today = new Date().toLocaleDateString("en-CA", {
		timeZone: "Asia/Kuala_Lumpur",
	});
	const day = (n: number) => addDays(today, n);

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
	const call = async <T>(
		userId: string,
		method: "GET" | "PUT" | "POST",
		path: string,
		payload?: object,
	) => {
		const res = await app.inject({
			method,
			url: `/api${path}`,
			headers: { "x-test-user": userId },
			payload,
		});
		return {
			status: res.statusCode,
			body: res.json() as {
				success: boolean;
				data: T;
				error?: string;
				fields?: Record<string, string>;
			},
		};
	};
	const cycle = (
		startsOn: string,
		endsOn: string,
		incomeMinor = 450_000,
		method: string | null = "envelope",
	) => ({ period: "cycle", cycle: { startsOn, endsOn }, incomeMinor, method });
	const rows = async (userId: string) =>
		(
			await db
				.select()
				.from(payCycle)
				.where(eq(payCycle.userId, userId))
				.orderBy(asc(payCycle.startsOn))
		).map((r) => [r.startsOn, r.endsOn, r.status]);
	const onCycles = async (
		userId: string,
		list: { startsOn: string; endsOn: string; incomeMinor?: number }[],
	) => {
		await db
			.update(profile)
			.set({ period: "cycle" })
			.where(eq(profile.userId, userId));
		await db
			.insert(payCycle)
			.values(list.map((c) => ({ userId, incomeMinor: 1, ...c })));
	};

	beforeAll(async () => {
		await seedCategories(db);
		admin = await createPerson(db, { role: "admin" });
		const categories = createCategoryRepository(db);
		const transactions = createTransactionRepository(db);
		const summary = createSummaryService(db);
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
				}),
				summary,
				plan: createPlanRepository(db),
				planSetup: createPlanSetupService(db, summary),
			},
		});
	});
	afterAll(async () => {
		await app?.close();
		await database.close();
	});

	it("starts on the calendar month with the profile's income", async () => {
		const maya = await createPerson(db);
		const { body } = await call<PlanSetup>(maya, "GET", "/plan/setup");
		expect(body.data).toEqual({
			period: "month",
			cycle: null,
			incomeMinor: 600_000,
			method: "envelope",
			today,
		});
	});

	it("saves a cycle, salary and style in one go", async () => {
		const maya = await createPerson(db);
		const { status, body } = await call<PlanSetup>(
			maya,
			"PUT",
			"/plan/setup",
			cycle(day(-2), day(28), 512_300, "pay_yourself_first"),
		);
		expect(status).toBe(200);
		expect(body.data).toMatchObject({
			period: "cycle",
			cycle: { startsOn: day(-2), endsOn: day(28), status: "set" },
			incomeMinor: 512_300,
			method: "pay_yourself_first",
		});
		const s = await call<Summary>(maya, "GET", "/summary");
		expect(s.body.data.period).toMatchObject({ kind: "cycle", start: day(-2) });
		expect(s.body.data.incomeMinor).toBe(512_300);
	});

	it("edits the current cycle and moves the previous cycle's end", async () => {
		const maya = await createPerson(db);
		await onCycles(maya, [
			{ startsOn: day(-32), endsOn: day(-3) },
			{ startsOn: day(-2), endsOn: day(28) },
		]);
		const { status } = await call(
			maya,
			"PUT",
			"/plan/setup",
			cycle(day(-5), day(25)),
		);
		expect(status).toBe(200);
		expect(await rows(maya)).toEqual([
			[day(-32), day(-6), "set"],
			[day(-5), day(25), "set"],
		]);
	});

	it("refuses bad ranges with a message on the field", async () => {
		const maya = await createPerson(db);
		const short = await call(maya, "PUT", "/plan/setup", cycle(day(0), day(3)));
		expect(short.status).toBe(400);
		expect(short.body.fields).toEqual({
			"cycle.endsOn": "A cycle is 7 to 62 days.",
		});
		const future = await call(
			maya,
			"PUT",
			"/plan/setup",
			cycle(day(1), day(30)),
		);
		expect(future.body.fields).toEqual({
			"cycle.startsOn": "Today has to be inside your cycle.",
		});
		const noDates = await call(maya, "PUT", "/plan/setup", {
			period: "cycle",
			cycle: null,
			incomeMinor: 1,
			method: null,
		});
		expect(noDates.body.fields).toEqual({
			"cycle.startsOn": "Pick the start and end dates.",
		});
		expect(await rows(maya)).toEqual([]);
	});

	it("refuses a start before the last cycle began", async () => {
		const maya = await createPerson(db);
		await onCycles(maya, [
			{ startsOn: day(-10), endsOn: day(-3) },
			{ startsOn: day(-2), endsOn: day(28) },
		]);
		const r = await call(maya, "PUT", "/plan/setup", cycle(day(-12), day(18)));
		expect(r.body.fields).toEqual({
			"cycle.startsOn": "This starts before your last cycle began.",
		});
	});

	it("switches back to the calendar month and keeps finished cycles", async () => {
		const maya = await createPerson(db);
		await onCycles(maya, [
			{ startsOn: day(-32), endsOn: day(-3) },
			{ startsOn: day(-2), endsOn: day(28) },
		]);
		const { body } = await call<PlanSetup>(maya, "PUT", "/plan/setup", {
			period: "month",
			cycle: null,
			incomeMinor: 480_000,
			method: "fifty_thirty_twenty",
		});
		expect(body.data).toMatchObject({
			period: "month",
			cycle: null,
			incomeMinor: 480_000,
			method: "fifty_thirty_twenty",
		});
		expect(await rows(maya)).toEqual([[day(-32), day(-3), "set"]]);
	});

	it("confirms a draft cycle once", async () => {
		const maya = await createPerson(db);
		await onCycles(maya, [
			{ startsOn: day(-31), endsOn: day(-1), incomeMinor: 420_000 },
		]);
		const before = await call<PlanSetup>(maya, "GET", "/plan/setup");
		expect(before.body.data.cycle).toMatchObject({
			startsOn: day(0),
			endsOn: day(30),
			status: "draft",
		});
		expect(before.body.data.incomeMinor).toBe(420_000);
		const ok = await call<PlanSetup>(maya, "POST", "/plan/cycle/confirm");
		expect(ok.body.data.cycle?.status).toBe("set");
		const again = await call(maya, "POST", "/plan/cycle/confirm");
		expect(again.status).toBe(409);
	});

	it("previews the daily amount without saving", async () => {
		const maya = await createPerson(db);
		const { body } = await call<PlanPreview>(
			maya,
			"POST",
			"/plan/setup/preview",
			cycle(day(0), day(29), 300_000, null),
		);
		// No spending, no goals, no plan style: 300,000 over 30 days.
		expect(body.data).toEqual({
			status: "ok",
			dailyAllowanceMinor: 10_000,
			days: 30,
			daysLeft: 30,
		});
		expect(await rows(maya)).toEqual([]);
	});

	it("never lets an admin in", async () => {
		const r = await call(admin, "GET", "/plan/setup");
		expect([401, 403]).toContain(r.status);
	});
});
