import { describe, expect, it } from "vitest";
import { quickReadSpoken, splitSpokenEntries } from "./voice";

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
