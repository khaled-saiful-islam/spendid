import { type Db, user } from "@spendid/db";
import { eq, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Auth } from "./auth";

export interface AccountDeps {
	auth: Auth;
	db: Db;
}

const Body = z.object({ identifier: z.string().trim().min(3).max(254) });
const QUIET_MS = 60_000;

/**
 * "Send the confirmation link again" for people who signed in with a username or email
 * before confirming. Always answers the same way, so it can't reveal which accounts exist.
 */
export async function accountRoutes(
	app: FastifyInstance,
	deps: AccountDeps,
): Promise<void> {
	const lastSent = new Map<string, number>();

	app.post("/account/resend-verification", async (req) => {
		const { identifier } = Body.parse(req.body);
		const key = identifier.toLowerCase();
		const now = Date.now();
		if (now - (lastSent.get(key) ?? 0) < QUIET_MS)
			return { success: true, data: null };
		lastSent.set(key, now);
		if (lastSent.size > 10_000) lastSent.clear();

		const [person] = await deps.db
			.select({ email: user.email, verified: user.emailVerified })
			.from(user)
			.where(or(sql`lower(${user.email}) = ${key}`, eq(user.username, key)))
			.limit(1);
		if (person && !person.verified)
			await deps.auth.api
				.sendVerificationEmail({
					body: { email: person.email, callbackURL: "/onboarding" },
				})
				.catch(() => undefined);
		return { success: true, data: null };
	});
}
