import { aiUsage, createDb } from "@spendid/db";
import { createAppSettings } from "@spendid/server";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { buildApp } from "../../app";
import type { Auth } from "../../auth/auth";
import type { SessionLookup } from "../../auth/guards";
import { createAdminRepository } from "./admin.repository";
import { createAdminService } from "./admin.service";

const url = testDbUrl();
/** Tests use Redis database 1 so they never touch the dev app's cache (database 0). */
const redisUrl = process.env.REDIS_URL
	? (() => {
			const u = new URL(process.env.REDIS_URL);
			u.pathname = "/1";
			return u.toString();
		})()
	: undefined;

describe.skipIf(!url || !redisUrl)("admin API (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	const redis = new Redis(redisUrl ?? "redis://unused", { lazyConnect: true });
	let app: FastifyInstance;
	let admin: string;
	let otherAdmin: string;
	let maya: string;

	const session: SessionLookup = async (headers) => {
		const id = headers.get("x-test-user");
		if (!id) return null;
		return {
			id,
			name: "T",
			email: "t@test.local",
			emailVerified: true,
			role: id === admin || id === otherAdmin ? "admin" : "user",
		};
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
			body: res.json() as { success: boolean; data: T; error?: string },
		};
	};

	beforeAll(async () => {
		await redis.connect();
		admin = await createPerson(db, { role: "admin" });
		otherAdmin = await createPerson(db, { role: "admin" });
		maya = await createPerson(db);
		await db.insert(aiUsage).values({
			userId: maya,
			feature: "ask",
			model: "test",
			inputTokens: 900,
			outputTokens: 100,
			billedTokens: 1000,
		});
		const repo = createAdminRepository(db);
		const settings = createAppSettings({
			db,
			redis,
			defaults: { aiEnabled: true, defaultMonthlyTokens: 200_000 },
		});
		app = await buildApp({
			checks: { database: database.ping, redis: async () => true },
			admin: {
				session,
				repo,
				service: createAdminService({
					repo,
					settings,
					auth: {} as Auth,
					sendEmail: async () => {},
					appUrl: "http://localhost:8600",
				}),
			},
		});
	});

	afterAll(async () => {
		await app?.close();
		await redis.quit();
		await database.close();
	});

	it("is closed to people who aren't admins", async () => {
		expect((await call(maya, "GET", "/admin/overview")).status).toBe(403);
		expect((await call(maya, "GET", "/admin/users")).status).toBe(403);
	});

	it("gives an overview of people, AI use and email health", async () => {
		const res = await call<{
			people: { total: number };
			ai: { tokensMonth: number; byFeature: { feature: string }[] };
			settings: { aiEnabled: boolean };
		}>(admin, "GET", "/admin/overview");
		expect(res.status).toBe(200);
		expect(res.body.data.people.total).toBeGreaterThan(0);
		expect(res.body.data.ai.tokensMonth).toBeGreaterThanOrEqual(1000);
		expect(res.body.data.ai.byFeature.map((f) => f.feature)).toContain("ask");
	});

	it("lists people with AI counts and no money fields", async () => {
		const res = await call<{ items: Record<string, unknown>[] }>(
			admin,
			"GET",
			"/admin/users",
		);
		const row = res.body.data.items.find((u) => u.id === maya);
		expect(row).toMatchObject({
			role: "user",
			ai: { usedTokens: 1000, enabled: true },
		});
		expect(Object.keys(row ?? {}).sort()).toEqual(
			[
				"ai",
				"banReason",
				"banned",
				"createdAt",
				"email",
				"emailVerified",
				"id",
				"lastActiveAt",
				"name",
				"role",
				"username",
			].sort(),
		);
	});

	it("sets a person's AI allowance and records it in the audit log", async () => {
		const res = await call(admin, "PUT", `/admin/users/${maya}/ai`, {
			monthlyTokens: 5000,
			enabled: false,
		});
		expect(res.status).toBe(200);
		const users = await call<{
			items: { id: string; ai: { limitTokens: number; enabled: boolean } }[];
		}>(admin, "GET", "/admin/users");
		expect(users.body.data.items.find((u) => u.id === maya)?.ai).toMatchObject({
			limitTokens: 5000,
			enabled: false,
		});
		const audit = await call<{ action: string }[]>(
			admin,
			"GET",
			"/admin/audit",
		);
		expect(audit.body.data.map((a) => a.action)).toContain("ai.limit-set");
	});

	it("won't let an admin change another admin", async () => {
		const res = await call(admin, "PUT", `/admin/users/${otherAdmin}/ai`, {
			monthlyTokens: 1,
			enabled: false,
		});
		expect(res.status).toBe(403);
	});

	it("flips the global AI switch", async () => {
		const res = await call<{ aiEnabled: boolean }>(
			admin,
			"PUT",
			"/admin/settings",
			{ aiEnabled: false },
		);
		expect(res.body.data.aiEnabled).toBe(false);
		const back = await call<{ aiEnabled: boolean }>(
			admin,
			"PUT",
			"/admin/settings",
			{ aiEnabled: true },
		);
		expect(back.body.data.aiEnabled).toBe(true);
	});
});
