import { mkdir } from "node:fs/promises";
import { type FullConfig, request } from "@playwright/test";
import { ACCOUNTS, type AccountName, stateFile } from "./tests/support/accounts";

/** Signs each demo account in once and saves the session, so tests skip the sign-in form. */
export default async function globalSetup(config: FullConfig): Promise<void> {
	const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:8600";
	await mkdir(".auth", { recursive: true });
	for (const name of Object.keys(ACCOUNTS) as AccountName[]) {
		const { username, password } = ACCOUNTS[name];
		const ctx = await request.newContext({
			baseURL,
			// Better Auth checks the Origin on writes, like a real browser sends it.
			extraHTTPHeaders: { Origin: baseURL },
		});
		const res = await ctx.post("/api/auth/sign-in/username", {
			data: { username, password },
		});
		if (!res.ok()) {
			throw new Error(
				`Couldn't sign in ${username} (${res.status()}). Is the app running and seeded? Try: make up && make demo`,
			);
		}
		// Tests read English copy; members keep their language on their profile.
		if (name !== "admin") {
			const lang = await ctx.put("/api/me/locale", { data: { locale: "en" } });
			if (!lang.ok()) throw new Error(`Couldn't set ${username}'s language (${lang.status()}).`);
		}
		await ctx.storageState({ path: stateFile(name) });
		await ctx.dispose();
	}
}
