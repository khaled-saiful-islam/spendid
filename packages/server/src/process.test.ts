import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { guardProcess, logErrors } from "./process";

describe("logErrors", () => {
	it("logs an 'error' event instead of letting it crash the process", () => {
		const log = vi.fn();
		const redis = new EventEmitter();
		logErrors("redis", log, redis);
		expect(() => redis.emit("error", new Error("ECONNREFUSED"))).not.toThrow();
		expect(log).toHaveBeenCalledWith("redis error", expect.any(Error));
	});
});

describe("guardProcess", () => {
	it("logs a stray rejection and keeps running", () => {
		const log = vi.fn();
		const exit = vi.fn();
		const proc = new EventEmitter();
		guardProcess(log, { proc, exit });
		proc.emit("unhandledRejection", new Error("lost promise"));
		expect(log).toHaveBeenCalledWith("unhandled rejection", expect.any(Error));
		expect(exit).not.toHaveBeenCalled();
	});

	it("logs an uncaught exception and exits so the container restarts clean", () => {
		const log = vi.fn();
		const exit = vi.fn();
		const proc = new EventEmitter();
		guardProcess(log, { proc, exit });
		proc.emit("uncaughtException", new Error("boom"));
		expect(log).toHaveBeenCalledWith("uncaught exception", expect.any(Error));
		expect(exit).toHaveBeenCalledWith(1);
	});
});
