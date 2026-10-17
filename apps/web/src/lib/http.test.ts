import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, whenSignedOut } from "./http";

const reply = (status: number, body: unknown) =>
	vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("api", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		whenSignedOut(() => {});
	});

	it("tells the app when the session has ended", async () => {
		const signedOut = vi.fn();
		whenSignedOut(signedOut);
		vi.stubGlobal(
			"fetch",
			reply(401, { success: false, error: "Sign in to continue." }),
		);
		await expect(api("/api/summary")).rejects.toBeInstanceOf(ApiError);
		expect(signedOut).toHaveBeenCalledTimes(1);
	});

	it("doesn't for other errors", async () => {
		const signedOut = vi.fn();
		whenSignedOut(signedOut);
		vi.stubGlobal("fetch", reply(403, { success: false, error: "No." }));
		await expect(api("/api/admin")).rejects.toThrow("No.");
		expect(signedOut).not.toHaveBeenCalled();
	});
});
