import { describe, expect, it } from "vitest";
import { computeStreak, festiveLook, hoursOfWork, pipLevel } from "./delight";

describe("computeStreak", () => {
	it("counts back from today when today is done", () => {
		expect(
			computeStreak(["2026-10-14", "2026-10-15", "2026-10-16"], "2026-10-16"),
		).toMatchObject({ current: 3, best: 3, doneToday: true, loggedDays: 3 });
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
		).toMatchObject({
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

describe("streak shields", () => {
	const run = (from: string, n: number) =>
		Array.from({ length: n }, (_, i) =>
			new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000)
				.toISOString()
				.slice(0, 10),
		);

	it("earns a shield every 7 days and spends it on a missed day", () => {
		// 1-7 Oct logged, 8 Oct missed, 9-10 Oct logged.
		const s = computeStreak(
			[...run("2026-10-01", 7), ...run("2026-10-09", 2)],
			"2026-10-10",
		);
		expect(s).toMatchObject({
			current: 9,
			shields: 0,
			shieldedDays: ["2026-10-08"],
		});
	});

	it("keeps at most two and breaks when none are left", () => {
		const long = run("2026-09-01", 21); // three shields earned, two kept
		expect(computeStreak(long, "2026-09-21").shields).toBe(2);
		// Missing 22, 23 and 24 Sep: two shields cover two days, the third breaks it.
		expect(computeStreak([...long, "2026-09-25"], "2026-09-25")).toMatchObject({
			current: 1,
			best: 21,
		});
	});

	it("covers yesterday automatically when it was missed", () => {
		const s = computeStreak(run("2026-10-01", 7), "2026-10-09");
		expect(s).toMatchObject({
			current: 7,
			doneToday: false,
			shieldedDays: ["2026-10-08"],
		});
	});
});

describe("Pip", () => {
	it("grows with days logged and lists the gifts so far", () => {
		expect(pipLevel(0)).toMatchObject({
			level: 1,
			gifts: [],
			next: { days: 3, gift: "leaf" },
		});
		expect(pipLevel(15)).toMatchObject({
			level: 4,
			gifts: ["leaf", "scarf", "explorer"],
		});
		expect(pipLevel(500).next).toBeNull();
	});
	it("dresses up for celebrations, a week either side", () => {
		expect(festiveLook("2026-11-05")).toBe("lamp");
		expect(festiveLook("2026-08-28")).toBe("flag");
		expect(festiveLook("2026-10-17")).toBeNull();
	});
});

describe("hoursOfWork", () => {
	it("turns a price into working hours from monthly income", () => {
		expect(hoursOfWork(34_667, 600_000)).toBe(10);
		expect(hoursOfWork(5_000, null)).toBeNull();
	});
});
