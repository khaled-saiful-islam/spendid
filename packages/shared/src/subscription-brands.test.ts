import { describe, expect, it } from "vitest";
import { brandForName, SUBSCRIPTION_BRANDS } from "./subscription-brands";

describe("subscription catalogue", () => {
	it("has unique keys that fit the database column", () => {
		const keys = SUBSCRIPTION_BRANDS.map((b) => b.key);
		expect(new Set(keys).size).toBe(keys.length);
		for (const k of keys) expect(k.length).toBeLessThanOrEqual(20);
	});

	it("knows a service from the name people type", () => {
		const cases: [string, string | undefined][] = [
			["Netflix", "netflix"],
			["netflix premium", "netflix"],
			["Spotify Family", "spotify"],
			["YouTube Music Family", "ytmusic"],
			["YouTube Premium", "youtube"],
			["TNB", "tnb"],
			["Unifi home fibre", "unifi"],
			["Gym", "gym"],
			["Gymboree", undefined],
			["My landlord", undefined],
		];
		for (const [name, key] of cases)
			expect([name, brandForName(name)?.key]).toEqual([name, key]);
	});
});
