import { describe, expect, it } from "vitest";
import { formatMinor, minorDigits, toMinor } from "./money";

describe("minorDigits", () => {
	it("knows how many decimals a currency uses", () => {
		expect(minorDigits("MYR")).toBe(2);
		expect(minorDigits("JPY")).toBe(0);
		expect(minorDigits("KWD")).toBe(3);
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
