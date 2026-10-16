import { describe, expect, it } from "vitest";
import { LOCK_AFTER_MS, shouldLock } from "./policy";

const now = 1_000_000_000;

describe("shouldLock", () => {
	it("never locks when app lock is off", () => {
		expect(
			shouldLock(
				{ enabled: false, unlockedThisVisit: false, hiddenAt: null },
				now,
			),
		).toBe(false);
	});

	it("locks on a fresh open", () => {
		expect(
			shouldLock(
				{ enabled: true, unlockedThisVisit: false, hiddenAt: null },
				now,
			),
		).toBe(true);
	});

	it("does not lock after a quick app switch", () => {
		expect(
			shouldLock(
				{ enabled: true, unlockedThisVisit: true, hiddenAt: now - 30_000 },
				now,
			),
		).toBe(false);
	});

	it("locks after a long time in the background", () => {
		expect(
			shouldLock(
				{
					enabled: true,
					unlockedThisVisit: true,
					hiddenAt: now - LOCK_AFTER_MS,
				},
				now,
			),
		).toBe(true);
	});
});
