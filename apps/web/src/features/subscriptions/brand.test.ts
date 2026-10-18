import { SUBSCRIPTION_BRANDS } from "@spendid/shared";
import { describe, expect, it } from "vitest";
import { LOGOS, looksOf } from "./brand";

describe("subscription logos", () => {
	it("has every logo the catalogue names", () => {
		for (const b of SUBSCRIPTION_BRANDS)
			if (b.logo)
				expect([b.key, Boolean(LOGOS[b.logo]?.path)]).toEqual([b.key, true]);
	});

	it("finds the logo from a typed name, and keeps readable ink on light tiles", () => {
		expect(looksOf({ brand: null, name: "Netflix Premium" }).logo?.title).toBe(
			"Netflix",
		);
		expect(looksOf({ brand: "yes", name: "Yes" }).ink).not.toBe("#FFFFFF");
		expect(looksOf({ brand: null, name: "My landlord" }).logo).toBeUndefined();
	});
});
