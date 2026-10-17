import { ServiceError } from "@spendid/server";
import { describe, expect, it } from "vitest";
import { messageOf } from "./ask.routes";

describe("messageOf", () => {
	it("shows the plain message of a limit, even when the agent wraps it", () => {
		const limit = new ServiceError(
			429,
			"That's a lot of requests in a minute.",
		);
		const wrapped = Object.assign(
			new Error(`${limit.message}: ${limit.message}`),
			{
				name: "MiddlewareError",
				cause: limit,
			},
		);
		expect(messageOf(wrapped)).toBe("That's a lot of requests in a minute.");
	});

	it("keeps unexpected errors vague", () => {
		expect(messageOf(new Error("socket hang up"))).toMatch(/had a problem/);
	});
});
