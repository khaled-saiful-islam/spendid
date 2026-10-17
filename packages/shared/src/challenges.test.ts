import { describe, expect, it } from "vitest";
import {
	type ChallengeDay,
	challengeWindow,
	judgeChallenge,
} from "./challenges";

const day = (
	d: string,
	minor = 0,
	extra: Partial<ChallengeDay> = {},
): ChallengeDay => ({
	day: d,
	minor,
	bySlug: {},
	active: minor > 0,
	...extra,
});

describe("challenge windows", () => {
	it("starts a weekend challenge on the coming Saturday", () => {
		expect(challengeWindow("no-spend-weekend", "2026-10-14")).toEqual({
			start: "2026-10-17",
			end: "2026-10-18",
		});
		expect(challengeWindow("no-spend-weekend", "2026-10-18")).toEqual({
			start: "2026-10-18",
			end: "2026-10-18",
		});
		expect(challengeWindow("cook-at-home", "2026-10-17")).toEqual({
			start: "2026-10-17",
			end: "2026-10-23",
		});
	});
});

describe("judging", () => {
	const base = { targetMinor: null, start: "2026-10-17", end: "2026-10-18" };

	it("wins a no-spend weekend and loses it on any spending", () => {
		expect(
			judgeChallenge({
				...base,
				kind: "no-spend-weekend",
				today: "2026-10-19",
				days: [day("2026-10-17"), day("2026-10-18")],
			}).status,
		).toBe("won");
		const lost = judgeChallenge({
			...base,
			kind: "no-spend-weekend",
			today: "2026-10-18",
			days: [day("2026-10-17", 1200)],
		});
		expect(lost.status).toBe("lost");
		expect(lost.days.map((d) => d.state)).toEqual(["fail", "pending"]);
	});

	it("counts eating out across the week", () => {
		const food = (d: string, count: number) =>
			day(d, count * 1000, {
				bySlug: { food: { minor: count * 1000, count } },
			});
		const r = judgeChallenge({
			kind: "cook-at-home",
			targetMinor: null,
			start: "2026-10-17",
			end: "2026-10-23",
			today: "2026-10-19",
			days: [
				food("2026-10-17", 1),
				food("2026-10-18", 1),
				food("2026-10-19", 1),
			],
		});
		expect(r.status).toBe("lost");
		expect(r.days.slice(0, 3).map((d) => d.state)).toEqual([
			"pass",
			"pass",
			"fail",
		]);
	});

	it("lets today still be logged for log-every-day", () => {
		const r = judgeChallenge({
			kind: "log-daily",
			targetMinor: null,
			start: "2026-10-17",
			end: "2026-10-23",
			today: "2026-10-18",
			days: [day("2026-10-17", 500)],
		});
		expect(r.status).toBe("active");
		expect(r.days.slice(0, 2).map((d) => d.state)).toEqual(["pass", "pending"]);
	});

	it("tracks how much of an eating-out cap is used", () => {
		const r = judgeChallenge({
			kind: "eat-out-cap",
			targetMinor: 10_000,
			start: "2026-10-17",
			end: "2026-10-23",
			today: "2026-10-18",
			days: [
				day("2026-10-17", 4_000, {
					bySlug: { food: { minor: 4_000, count: 2 } },
				}),
			],
		});
		expect(r).toMatchObject({ status: "active", usedMinor: 4_000 });
	});
});
