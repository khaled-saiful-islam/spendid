import type { Me, ProfileInput } from "@spendid/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app";
import type { SessionLookup, SessionUser } from "../../auth/guards";
import type { MeRepository } from "./me.repository";

const maya: SessionUser = {
	id: "u1",
	name: "Maya",
	email: "maya@example.com",
	emailVerified: true,
	role: "user",
};

function fakeSession(signedIn: SessionUser | null): SessionLookup {
	return async () => signedIn;
}

function fakeRepo(): MeRepository & { saved: ProfileInput[] } {
	const saved: ProfileInput[] = [];
	const me = (onboarded: boolean): Me => ({
		user: { ...maya, username: null, role: "user" },
		profile: {
			homeCurrency: "MYR",
			locale: "en",
			timeZone: "Asia/Kuala_Lumpur",
			monthlyIncomeMinor: null,
			budgetMethod: "fifty_thirty_twenty",
			onboardedAt: onboarded ? new Date(0).toISOString() : null,
		},
		needsOnboarding: !onboarded,
		currencyLocked: false,
	});
	return {
		saved,
		find: async (id) => (id === maya.id ? me(false) : null),
		saveProfile: async (_id, input) => {
			saved.push(input);
			return me(true);
		},
		setLocale: async () => me(true),
	};
}

const healthy = { database: async () => true, redis: async () => true };

describe("/api/me", () => {
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;
	afterEach(async () => app?.close());

	it("returns null (not an error) when nobody is signed in", async () => {
		app = await buildApp({
			checks: healthy,
			me: { session: fakeSession(null), repo: fakeRepo() },
		});
		const res = await app.inject({ method: "GET", url: "/api/me" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toMatchObject({ success: true, data: null });
	});

	it("returns the signed-in person and whether onboarding is needed", async () => {
		app = await buildApp({
			checks: healthy,
			me: { session: fakeSession(maya), repo: fakeRepo() },
		});
		const res = await app.inject({ method: "GET", url: "/api/me" });
		expect(res.statusCode).toBe(200);
		expect(res.json().data).toMatchObject({
			user: { email: maya.email },
			needsOnboarding: true,
		});
	});

	it("rejects saving a profile when signed out", async () => {
		app = await buildApp({
			checks: healthy,
			me: { session: fakeSession(null), repo: fakeRepo() },
		});
		const res = await app.inject({
			method: "PUT",
			url: "/api/me/profile",
			payload: {},
		});
		expect(res.statusCode).toBe(401);
	});

	it("validates the profile and reports which field is wrong", async () => {
		const repo = fakeRepo();
		app = await buildApp({
			checks: healthy,
			me: { session: fakeSession(maya), repo },
		});
		const res = await app.inject({
			method: "PUT",
			url: "/api/me/profile",
			payload: {
				name: "Maya",
				homeCurrency: "ZZZ",
				locale: "en",
				timeZone: "UTC",
				monthlyIncomeMinor: null,
				budgetMethod: "envelope",
			},
		});
		expect(res.statusCode).toBe(400);
		expect(res.json().fields).toHaveProperty("homeCurrency");
		expect(repo.saved).toHaveLength(0);
	});
});
