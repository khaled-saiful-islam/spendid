import { describe, expect, it } from "vitest";
import { allowanceMonth } from "./allowance-month";

describe("allowanceMonth (Malaysia time)", () => {
	it("renews at midnight on the 1st in Malaysia, not 8 am", () => {
		// 23:59 on 31 Oct in Kuala Lumpur: still October.
		expect(allowanceMonth(new Date("2026-10-31T15:59:00Z"))).toEqual({
			key: "202610",
			start: new Date("2026-09-30T16:00:00Z"),
			resetsOn: "2026-11-01",
		});
		// 00:00 on 1 Nov in Kuala Lumpur: a fresh month.
		expect(allowanceMonth(new Date("2026-10-31T16:00:00Z"))).toEqual({
			key: "202611",
			start: new Date("2026-10-31T16:00:00Z"),
			resetsOn: "2026-12-01",
		});
	});

	it("rolls over the year", () => {
		expect(allowanceMonth(new Date("2026-12-31T16:30:00Z"))).toMatchObject({
			key: "202701",
			resetsOn: "2027-02-01",
		});
	});
});
