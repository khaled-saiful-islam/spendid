import { describe, expect, it } from "vitest";
import { hoursOfWork } from "./delight";

describe("hoursOfWork", () => {
	it("turns a price into working hours from monthly income", () => {
		expect(hoursOfWork(34_667, 600_000)).toBe(10);
		expect(hoursOfWork(5_000, null)).toBeNull();
	});
});
