import { describe, expect, it } from "vitest";
import { wordsToDigits } from "./number-words";

describe("wordsToDigits", () => {
	it("turns spoken numbers into digits and keeps separate numbers apart", () => {
		expect(
			wordsToDigits("Grab fifteen coffee six ringgit and forty for dinner"),
		).toBe("Grab 15 coffee 6 ringgit and 40 for dinner");
	});

	it("handles compound English numbers", () => {
		expect(wordsToDigits("forty five")).toBe("45");
		expect(wordsToDigits("one hundred and twenty")).toBe("120");
		expect(wordsToDigits("two thousand five hundred")).toBe("2500");
		expect(wordsToDigits("a hundred")).toBe("100");
		expect(wordsToDigits("six point five")).toBe("6.5");
	});

	it("understands Malay numbers", () => {
		expect(wordsToDigits("teh tarik tiga ringgit, nasi lemak lapan")).toBe(
			"teh tarik 3 ringgit, nasi lemak 8",
		);
		expect(wordsToDigits("dua puluh lima")).toBe("25");
		expect(wordsToDigits("dua belas")).toBe("12");
		expect(wordsToDigits("seratus")).toBe("100");
		expect(wordsToDigits("dua ribu lima ratus")).toBe("2500");
	});

	it("leaves ordinary words and 'and' alone", () => {
		expect(wordsToDigits("coffee and cake")).toBe("coffee and cake");
		expect(wordsToDigits("a coffee")).toBe("a coffee");
	});
});
