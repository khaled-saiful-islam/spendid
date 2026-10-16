import { describe, expect, it } from "vitest";
import {
	coverTransform,
	createSteadiness,
	type Quad,
	quadArea,
	quadMovement,
} from "./geometry";

const square: Quad = [
	[0.2, 0.2],
	[0.8, 0.2],
	[0.8, 0.8],
	[0.2, 0.8],
];
const nudged = (q: Quad, d: number): Quad =>
	q.map(([x, y]) => [x + d, y]) as Quad;

describe("quad geometry", () => {
	it("measures area as a share of the frame", () => {
		expect(quadArea(square)).toBeCloseTo(0.36);
	});

	it("measures how far the receipt moved", () => {
		expect(quadMovement(square, nudged(square, 0.01))).toBeCloseTo(0.01);
	});

	it("maps frame points onto a cover-fitted screen", () => {
		// 1000×500 video in a 500×500 box: scaled ×1, 250 px cut off each side.
		const map = coverTransform({ w: 1000, h: 500 }, { w: 500, h: 500 });
		expect(map([0.5, 0.5])).toEqual([250, 250]);
		expect(map([0.25, 0])).toEqual([0, 0]);
	});
});

describe("steadiness", () => {
	it("reaches 1 after enough still frames and resets on movement or loss", () => {
		const s = createSteadiness({ frames: 3, maxMove: 0.02, minArea: 0.1 });
		expect(s.push(square)).toBe(0);
		s.push(square);
		s.push(nudged(square, 0.005));
		expect(s.push(square)).toBe(1);
		expect(s.push(nudged(square, 0.2))).toBe(0);
		expect(s.push(null)).toBe(0);
	});

	it("ignores shapes too small to be a receipt in view", () => {
		const tiny: Quad = [
			[0.45, 0.45],
			[0.5, 0.45],
			[0.5, 0.5],
			[0.45, 0.5],
		];
		const s = createSteadiness({ frames: 1, maxMove: 0.02, minArea: 0.1 });
		s.push(tiny);
		expect(s.push(tiny)).toBe(0);
	});
});
