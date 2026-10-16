import { describe, expect, it } from "vitest";
import { convertMinor } from "./fx";

describe("convertMinor", () => {
	it("returns the same amount for the same currency", () => {
		expect(
			convertMinor({
				amountMinor: 1234,
				from: "MYR",
				to: "MYR",
				fromPerEur: 4.5,
				toPerEur: 4.5,
			}),
		).toEqual({
			homeMinor: 1234,
			rate: 1,
		});
	});

	it("converts through EUR cross rates", () => {
		// 10.00 USD → MYR with EUR=1.12 USD and EUR=4.5757 MYR.
		const r = convertMinor({
			amountMinor: 1000,
			from: "USD",
			to: "MYR",
			fromPerEur: 1.12,
			toPerEur: 4.5757,
		});
		expect(r.homeMinor).toBe(4085);
	});

	it("respects currencies without decimals", () => {
		// ¥1000 → MYR: 1000 / 177.06 * 4.5757 = 25.84
		const r = convertMinor({
			amountMinor: 1000,
			from: "JPY",
			to: "MYR",
			fromPerEur: 177.06,
			toPerEur: 4.5757,
		});
		expect(r.homeMinor).toBe(2584);
	});
});
