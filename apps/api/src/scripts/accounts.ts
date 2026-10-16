import { createDb, profile, user } from "@spendid/db";
import type { ProfileInput } from "@spendid/shared";
import { eq } from "drizzle-orm";
import { createAuth } from "../auth/auth";
import { loadEnv } from "../config/env";
import { createRedis } from "../infra/redis";

export interface SeedAccount {
	name: string;
	email: string;
	username: string;
	password: string;
	role: "admin" | "user";
	profile?: Omit<ProfileInput, "name">;
}

/**
 * Creates verified accounts directly through Better Auth's internal adapter, so the
 * dev-only admin/admin password can exist without loosening the public sign-up rules.
 * Idempotent: an existing username is left untouched.
 */
export async function seedAccounts(accounts: SeedAccount[]): Promise<void> {
	const env = loadEnv();
	const database = createDb(env.DATABASE_URL, 2);
	const cache = createRedis(env.REDIS_URL);
	const auth = createAuth({
		env,
		db: database.db,
		redis: cache.redis,
		sendEmail: async () => {},
	});
	const ctx = await auth.$context;

	try {
		for (const account of accounts) {
			const [existing] = await database.db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.username, account.username))
				.limit(1);
			if (existing) {
				process.stdout.write(`[seed] ${account.username} already exists\n`);
				continue;
			}
			const created = await ctx.internalAdapter.createUser(
				{
					name: account.name,
					email: account.email,
					emailVerified: true,
					username: account.username,
					displayUsername: account.username,
					role: account.role,
				},
				{ method: "admin" },
			);
			await ctx.internalAdapter.linkAccount({
				userId: created.id,
				providerId: "credential",
				accountId: created.id,
				password: await ctx.password.hash(account.password),
			});
			if (account.profile) {
				await database.db
					.insert(profile)
					.values({
						userId: created.id,
						...account.profile,
						onboardedAt: new Date(),
					})
					.onConflictDoUpdate({
						target: profile.userId,
						set: { ...account.profile, onboardedAt: new Date() },
					});
			}
			process.stdout.write(
				`[seed] created ${account.role} ${account.username}\n`,
			);
		}
	} finally {
		await Promise.allSettled([database.close(), cache.close()]);
	}
}
