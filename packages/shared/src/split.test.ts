import { describe, expect, it } from "vitest";
import { allocate, computeSplit, SplitInputSchema } from "./split";

const people = [
	{ key: "a", name: "Maya", userId: null },
	{ key: "b", name: "Adam", userId: null },
	{ key: "c", name: "Sam", userId: null },
];

describe("allocate", () => {
	it("always adds up exactly", () => {
		expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
		expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
		expect(allocate(7, [0, 0])).toEqual([4, 3]);
	});
	it("follows the weights", () => {
		expect(allocate(100, [3, 1])).toEqual([75, 25]);
	});
});

describe("computeSplit", () => {
	it("splits shared items evenly and tax in proportion", () => {
		const r = computeSplit({
			people,
			items: [
				{ key: "1", name: "Nasi lemak", amountMinor: 1200, people: ["a"] },
				{ key: "2", name: "Teh tarik", amountMinor: 400, people: ["b"] },
				{ key: "3", name: "Satay", amountMinor: 3000, people: ["a", "b", "c"] },
			],
			adjustMinor: 460,
		});
		expect(r.shares.map((s) => s.itemsMinor)).toEqual([2200, 1400, 1000]);
		expect(r.shares.map((s) => s.adjustMinor)).toEqual([220, 140, 100]);
		expect(r.shares.reduce((a, s) => a + s.totalMinor, 0)).toBe(r.totalMinor);
		expect(r.totalMinor).toBe(5060);
	});

	it("counts items nobody has as unassigned", () => {
		const r = computeSplit({
			people,
			items: [{ key: "1", name: "Cake", amountMinor: 900, people: [] }],
			adjustMinor: 90,
		});
		expect(r.unassignedMinor).toBe(900);
		expect(r.shares.every((s) => s.totalMinor === 0)).toBe(true);
	});
});

describe("SplitInputSchema", () => {
	it("needs every item to belong to someone", () => {
		const r = SplitInputSchema.safeParse({
			title: "Dinner",
			currency: "MYR",
			people,
			items: [{ key: "1", name: "Cake", amountMinor: 900, people: [] }],
			adjustMinor: 0,
		});
		expect(r.success).toBe(false);
	});
});
