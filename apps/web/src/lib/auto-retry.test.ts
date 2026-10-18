import { describe, expect, it } from "vitest";
import { retryDelay } from "./auto-retry";

describe("retryDelay", () => {
	it("waits a little longer each time, then holds at 30 seconds", () => {
		expect([0, 1, 2, 3, 4, 9].map(retryDelay)).toEqual([5, 10, 20, 30, 30, 30]);
	});
});
