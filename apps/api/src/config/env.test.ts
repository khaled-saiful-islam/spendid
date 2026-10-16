import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const base = {
	DATABASE_URL: "postgres://u:p@db:5432/x",
	REDIS_URL: "redis://redis:6379",
	BETTER_AUTH_SECRET: "x".repeat(40),
};

describe("loadEnv", () => {
	it("accepts the dev defaults", () => {
		const env = loadEnv({ ...base });
		expect(env.SEED_ADMIN_USERNAME).toBe("admin");
		expect(env.API_PORT).toBe(8601);
	});

	it("refuses admin/admin and the placeholder secret in production", () => {
		expect(() =>
			loadEnv({
				...base,
				NODE_ENV: "production",
				BETTER_AUTH_SECRET: "change-me-to-a-long-random-string",
			}),
		).toThrow(
			/BETTER_AUTH_SECRET[\s\S]*SEED_ADMIN_PASSWORD|SEED_ADMIN_PASSWORD[\s\S]*BETTER_AUTH_SECRET/,
		);
	});
});
