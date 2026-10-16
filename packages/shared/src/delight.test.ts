import { describe, expect, it } from "vitest";
import { computeStreak, hoursOfWork } from "./delight";

describe("computeStreak", () => {
	it("counts back from today when today is done", () => {
		expect(
			computeStreak(["2026-10-14", "2026-10-15", "2026-10-16"], "2026-10-16"),
		).toEqual({ current: 3, best: 3, doneToday: true });
	});
	it("keeps the streak alive until today ends", () => {
		expect(
			computeStreak(["2026-10-14", "2026-10-15"], "2026-10-16"),
		).toMatchObject({ current: 2, doneToday: false });
	});
	it("breaks after a missed day but remembers the best run", () => {
		expect(
			computeStreak(
				["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-15"],
				"2026-10-17",
			),
		).toEqual({
			current: 0,
			best: 4,
			doneToday: false,
		});
	});
	it("crosses month ends", () => {
		expect(
			computeStreak(["2026-09-30", "2026-10-01"], "2026-10-01").current,
		).toBe(2);
	});
});

describe("hoursOfWork", () => {
	it("turns a price into working hours from monthly income", () => {
		expect(hoursOfWork(34_667, 600_000)).toBe(10);
		expect(hoursOfWork(5_000, null)).toBeNull();
	});
});
