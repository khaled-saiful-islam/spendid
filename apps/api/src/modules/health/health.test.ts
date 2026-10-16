import { HealthSchema } from "@spendid/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app";
import type { HealthChecks } from "./health.routes";

const healthy: HealthChecks = {
	database: async () => true,
	redis: async () => true,
};

describe("GET /api/health", () => {
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;

	afterEach(async () => {
		await app?.close();
	});

	it("returns ok when every service is up", async () => {
		app = await buildApp({ checks: healthy });
		const res = await app.inject({ method: "GET", url: "/api/health" });

		expect(res.statusCode).toBe(200);
		const body = HealthSchema.parse(res.json());
		expect(body.status).toBe("ok");
		expect(body.services).toEqual({ database: "up", redis: "up" });
	});

	it("returns 503 degraded when a service is down", async () => {
		app = await buildApp({ checks: { ...healthy, redis: async () => false } });
		const res = await app.inject({ method: "GET", url: "/api/health" });

		expect(res.statusCode).toBe(503);
		expect(HealthSchema.parse(res.json()).services.redis).toBe("down");
	});

	it("treats a throwing or hanging check as down", async () => {
		const hangs = () => new Promise<boolean>(() => {});
		const throws = async (): Promise<boolean> => {
			throw new Error("boom");
		};
		app = await buildApp({
			checks: { database: throws, redis: hangs },
			checkTimeoutMs: 20,
		});
		const res = await app.inject({ method: "GET", url: "/api/health" });

		expect(HealthSchema.parse(res.json()).services).toEqual({
			database: "down",
			redis: "down",
		});
	});
});
