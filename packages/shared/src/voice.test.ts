import { describe, expect, it } from "vitest";
import { wordsToDigits } from "./number-words";
import { hasSpokenAmount, quickReadSpoken, splitSpokenEntries } from "./voice";

describe("splitSpokenEntries", () => {
	it("splits a one-breath note into items", () => {
		expect(
			splitSpokenEntries("Grab 15 coffee 6 ringgit and 40 for dinner with Sam"),
		).toEqual(["Grab 15", "coffee 6 ringgit", "40 for dinner with Sam"]);
	});

	it("splits on commas and Malay connectors", () => {
		expect(
			splitSpokenEntries("teh tarik 3, nasi lemak 8 dan roti canai 2"),
		).toEqual(["teh tarik 3", "nasi lemak 8", "roti canai 2"]);
	});

	it("drops pieces without any amount", () => {
		expect(splitSpokenEntries("um so yeah")).toEqual([]);
	});
});

describe("quickReadSpoken", () => {
	it("reads each piece like typed shorthand", () => {
		const items = quickReadSpoken("Grab 15 coffee 6 ringgit");
		expect(items.map((i) => [i.description, i.amount, i.categorySlug])).toEqual(
			[
				["Grab", 15, "transport"],
				["Coffee", 6, "food"],
			],
		);
	});
});

describe("quickReadSpoken in real speech", () => {
	const read = (said: string) =>
		quickReadSpoken(wordsToDigits(said)).map((i) => [i.description, i.amount]);

	it("keeps only the shop or item, not greetings, filler or 'I spent'", () => {
		expect(read("Hi, yesterday I spent 20RM in grab.")).toEqual([["Grab", 20]]);
		expect(read("hello so today lunch 12 and um coffee 6")).toEqual([
			["Lunch", 12],
			["Coffee", 6],
		]);
		expect(read("okay I paid 35 for the gym")).toEqual([["Gym", 35]]);
		expect(read("Hai, semalam saya belanja 20 ringgit Grab")).toEqual([
			["Grab", 20],
		]);
		expect(read("eh saya beli nasi lemak lapan ringgit")).toEqual([
			["Nasi lemak", 8],
		]);
	});

	it("finds nothing in small talk", () => {
		expect(read("Hi.")).toEqual([]);
		expect(read("hello, how are you today?")).toEqual([]);
	});
});

describe("hasSpokenAmount", () => {
	it("says whether a phrase names any amount, in words or digits", () => {
		expect(hasSpokenAmount("Hi.")).toBe(false);
		expect(hasSpokenAmount("hello, how are you?")).toBe(false);
		expect(hasSpokenAmount("lunch twelve")).toBe(true);
		expect(hasSpokenAmount("grab dua puluh ringgit")).toBe(true);
		expect(hasSpokenAmount("coffee 6.50")).toBe(true);
	});
});
