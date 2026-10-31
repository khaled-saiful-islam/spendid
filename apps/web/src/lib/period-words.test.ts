import { describe, expect, it } from "vitest";
import { cycleDates, periodWords } from "./period-words";

describe("period words", () => {
	it("writes a cycle's dates the short way", () => {
		expect(cycleDates("2026-10-29", "2026-11-28", "2026-10-31")).toBe(
			"29 Oct → 28 Nov",
		);
	});

	it("adds years when the cycle leaves this year", () => {
		expect(cycleDates("2026-12-20", "2027-01-19", "2026-12-25")).toBe(
			"20 Dec 2026 → 19 Jan 2027",
		);
	});

	it("says cycle or month", () => {
		expect(periodWords("cycle").left).toBe("Left this cycle");
		expect(periodWords("month").left).toBe("Left this month");
		expect(periodWords("cycle").income).toBe("Salary this cycle");
		expect(periodWords("month").income).toBe("Monthly income");
	});
});
