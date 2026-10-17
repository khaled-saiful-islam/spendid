import { describe, expect, it } from "vitest";
import { dueDigests } from "./digests";

const at = (weekday: number, day: number, hour: number) => ({
	weekday,
	day,
	hour,
});

describe("dueDigests", () => {
	it("sends the Monday summary at 8 and the daily checks at 9", () => {
		expect(dueDigests(at(1, 13, 8))).toEqual(["weekly"]);
		expect(dueDigests(at(1, 13, 9))).toEqual(["weekly", "daily"]);
		expect(dueDigests(at(2, 14, 9))).toEqual(["daily"]);
	});

	it("still sends after a missed hour, but not all day", () => {
		expect(dueDigests(at(1, 13, 10))).toEqual(["weekly", "daily"]);
		expect(dueDigests(at(2, 14, 11))).toEqual(["daily"]);
		expect(dueDigests(at(2, 14, 12))).toEqual([]);
		expect(dueDigests(at(2, 14, 7))).toEqual([]);
	});

	it("adds the monthly plan and Wrapped on the 1st", () => {
		expect(dueDigests(at(3, 1, 8))).toEqual(["subscription-month"]);
		expect(dueDigests(at(3, 1, 9))).toEqual([
			"daily",
			"subscription-month",
			"wrapped",
		]);
	});
});
