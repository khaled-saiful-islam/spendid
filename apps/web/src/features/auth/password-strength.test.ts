import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password-strength";

describe("passwordStrength", () => {
	it("is 0 below the 8-character minimum", () => {
		expect(passwordStrength("")).toBe(0);
		expect(passwordStrength("abc1234")).toBe(0);
	});
	it("rewards length and variety, so a short sentence scores well", () => {
		expect(passwordStrength("abcdefgh")).toBe(1);
		expect(passwordStrength("abcd1234")).toBe(2);
		expect(passwordStrength("kopi panas 2 gelas")).toBe(4);
		expect(passwordStrength("Tr0ub4dour&3x")).toBe(3);
	});
});
