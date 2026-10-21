import { describe, expect, it } from "vitest";
import { resolveRange } from "./filters";

const ctx = { timeZone: "Asia/Kuala_Lumpur", today: "2026-10-21" };

describe("resolveRange with lastDays", () => {
	it("is N days up to and including today", () => {
		expect(resolveRange({ lastDays: 3 }, ctx)).toEqual({
			ok: { from: "2026-10-19", to: "2026-10-21" },
		});
		expect(resolveRange({ lastDays: 1 }, ctx)).toEqual({
			ok: { from: "2026-10-21", to: "2026-10-21" },
		});
	});

	it("crosses months correctly", () => {
		expect(
			resolveRange({ lastDays: 5 }, { ...ctx, today: "2026-03-02" }),
		).toEqual({ ok: { from: "2026-02-26", to: "2026-03-02" } });
	});
});
