import { describe, expect, it } from "vitest";
import { itemKey, priceChange, splitQuantity } from "./receipts";

describe("itemKey", () => {
	it("matches the same product written differently", () => {
		expect(itemKey("MILK FRESH 1L")).toBe(itemKey("Fresh Milk 1L"));
		expect(itemKey("Eggs Grade A 10s")).toBe(itemKey("EGGS GRADE-A 10S"));
	});

	it("keeps pack size, so 1L and 2L stay different", () => {
		expect(itemKey("Milk 1L")).not.toBe(itemKey("Milk 2L"));
	});
});

describe("splitQuantity", () => {
	it("pulls a printed multiplier out of the name", () => {
		expect(splitQuantity("MILK FRESH 1L x2")).toEqual({
			name: "MILK FRESH 1L",
			quantity: 2,
		});
		expect(splitQuantity("2 x Teh Tarik")).toEqual({
			name: "Teh Tarik",
			quantity: 2,
		});
		expect(splitQuantity("Sourdough loaf")).toEqual({
			name: "Sourdough loaf",
			quantity: 1,
		});
	});
});

describe("priceChange", () => {
	it("reports the percentage change in unit price, rounded", () => {
		expect(priceChange(690, 720)).toBe(4);
		expect(priceChange(1000, 900)).toBe(-10);
	});

	it("ignores missing or zero previous prices", () => {
		expect(priceChange(0, 500)).toBeNull();
	});
});
