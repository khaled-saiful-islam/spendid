import { describe, expect, it } from "vitest";
import { joinSegments } from "./segments";

describe("joinSegments", () => {
	it("returns a single segment unchanged", () => {
		const one = Float32Array.from([0.1, 0.2]);
		expect(joinSegments([one], 10)).toBe(one);
	});

	it("keeps every segment, in order, with silence between", () => {
		const out = joinSegments(
			[Float32Array.from([1, 1]), Float32Array.from([2])],
			10,
			0.2,
		);
		expect([...out]).toEqual([1, 1, 0, 0, 2]);
	});

	it("is empty when nothing was heard", () => {
		expect(joinSegments([], 16_000)).toHaveLength(0);
	});
});
