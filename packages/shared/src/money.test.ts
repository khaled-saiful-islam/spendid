import { describe, expect, it } from "vitest";
import { formatMinor, minorDigits, parseAmount, toMinor } from "./money";

describe("minorDigits", () => {
	it("knows how many decimals a currency uses", () => {
		expect(minorDigits("MYR")).toBe(2);
		expect(minorDigits("JPY")).toBe(0);
		expect(minorDigits("KWD")).toBe(3);
	});
});

describe("parseAmount", () => {
	it("reads a comma before three digits as thousands, as Malaysia writes it", () => {
		expect(parseAmount("4,500")).toBe(4500);
		expect(parseAmount("1,234,567.89")).toBe(1234567.89);
		expect(parseAmount("12,000.5")).toBe(12000.5);
	});

	it("reads a comma before one or two final digits as the decimal point", () => {
		expect(parseAmount("12,50")).toBe(12.5);
		expect(parseAmount("7,5")).toBe(7.5);
	});

	it("reads plain numbers and trims spaces", () => {
		expect(parseAmount("4500")).toBe(4500);
		expect(parseAmount(" 300.50 ")).toBe(300.5);
		expect(parseAmount(".5")).toBe(0.5);
		expect(parseAmount("0")).toBe(0);
	});

	it("treats a blank box as zero, like an empty field", () => {
		expect(parseAmount("")).toBe(0);
		expect(parseAmount("   ")).toBe(0);
	});

	it("refuses anything it would have to guess", () => {
		for (const bad of [
			"1,2345",
			"1.2.3",
			"1,500,00",
			"12,",
			",5",
			"abc",
			"1..5",
			"-5",
			"1,50.5",
		])
			expect(parseAmount(bad), bad).toBeNaN();
	});
});

describe("toMinor", () => {
	it("converts a typed amount to integer minor units without float drift", () => {
		expect(toMinor(12.3, "MYR")).toBe(1230);
		expect(toMinor(0.1 + 0.2, "USD")).toBe(30);
		expect(toMinor(500, "JPY")).toBe(500);
	});
});

describe("formatMinor", () => {
	it("formats minor units for display", () => {
		expect(formatMinor(4820, "MYR", "en-MY")).toBe("RM 48.20");
		expect(formatMinor(500, "JPY", "en-US")).toBe("¥500");
		expect(formatMinor(-1250, "USD", "en-US")).toBe("-$12.50");
	});
});
