import { describe, expect, it } from "vitest";
import { hedged } from "./hedge";

const resolveAfter = <T>(ms: number, value: T, signal?: AbortSignal) =>
	new Promise<T>((resolve, reject) => {
		const t = setTimeout(() => resolve(value), ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(t);
			reject(new Error("aborted"));
		});
	});

describe("hedged", () => {
	it("returns the first attempt when it is quick, without a second call", async () => {
		let calls = 0;
		const result = await hedged(
			(signal) => {
				calls++;
				return resolveAfter(10, "first", signal);
			},
			{ hedgeAfterMs: 50, deadlineMs: 500 },
		);
		expect(result).toBe("first");
		expect(calls).toBe(1);
	});

	it("starts a backup when the first is slow and takes whichever wins", async () => {
		let calls = 0;
		const aborted: number[] = [];
		const result = await hedged(
			(signal) => {
				const n = ++calls;
				signal.addEventListener("abort", () => aborted.push(n));
				return resolveAfter(n === 1 ? 400 : 20, `call ${n}`, signal);
			},
			{ hedgeAfterMs: 30, deadlineMs: 1000 },
		);
		expect(result).toBe("call 2");
		expect(aborted).toContain(1);
	});

	it("gives up at the deadline", async () => {
		await expect(
			hedged((signal) => resolveAfter(1000, "late", signal), {
				hedgeAfterMs: 10,
				deadlineMs: 60,
			}),
		).rejects.toThrow(/took too long/);
	});

	it("fails only when every attempt failed", async () => {
		let calls = 0;
		const result = hedged(
			async () => {
				calls++;
				if (calls === 1) throw new Error("first broke");
				return "second";
			},
			{ hedgeAfterMs: 1000, deadlineMs: 2000 },
		);
		await expect(result).resolves.toBe("second");
	});
});
