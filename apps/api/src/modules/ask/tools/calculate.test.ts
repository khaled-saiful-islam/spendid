import { describe, expect, it } from "vitest";
import { evaluate } from "./calculate";

describe("evaluate", () => {
	it.each([
		["85.40 + 120.15", 205.55],
		["0.1 + 0.2", 0.3],
		["703.45 / 31", 22.69],
		["(39.90 / 703.45) * 100", 5.67],
		["2 * (3 + 4)", 14],
		["-5 + 2", -3],
		["1,234.50 - 34.50", 1200],
		["100 - 12.5 * 2", 75],
		["471.30 + 445.50 + 228.80 + 156.80 + 129.90", 1432.3],
	])("%s = %s", (expression, result) => {
		expect(evaluate(expression)).toBe(result);
	});

	it.each([
		["1 / 0", /zero/i],
		["", /empty/i],
		["process.exit()", /only numbers/i],
		["2 +", /complete/i],
		["(1 + 2", /bracket/i],
		["10%", /only numbers/i],
	])("refuses %s", (expression, message) => {
		expect(() => evaluate(expression)).toThrow(message);
	});
});
