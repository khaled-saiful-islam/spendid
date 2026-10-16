import { describe, expect, it } from "vitest";
import { quietDelayMs } from "./notifications";

const min = 60_000;

describe("quietDelayMs", () => {
	it("waits until quiet hours end across midnight", () => {
		expect(quietDelayMs({ hour: 23, minute: 30 }, 22, 8)).toBe(
			(8 * 60 + 30) * min,
		);
		expect(quietDelayMs({ hour: 7, minute: 15 }, 22, 8)).toBe(45 * min);
	});
	it("sends right away outside quiet hours", () => {
		expect(quietDelayMs({ hour: 8, minute: 0 }, 22, 8)).toBe(0);
		expect(quietDelayMs({ hour: 21, minute: 59 }, 22, 8)).toBe(0);
	});
	it("handles a daytime quiet window and none at all", () => {
		expect(quietDelayMs({ hour: 13, minute: 0 }, 12, 14)).toBe(60 * min);
		expect(quietDelayMs({ hour: 3, minute: 0 }, 9, 9)).toBe(0);
	});
});
