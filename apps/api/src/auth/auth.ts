import { passkey } from "@better-auth/passkey";
import { type Db, profile, schema } from "@spendid/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { admin, username } from "better-auth/plugins";
import type { Redis } from "ioredis";
import type { Env } from "../config/env";
import type { SendEmail } from "../email/outbox";
import { ac, adminRole, userRole } from "./access";
import type { SessionLookup } from "./guards";
import { redisStorage } from "./redis-storage";

/** Security moments other modules react to (emails). Errors never block signing in. */
export interface AuthEvents {
	sessionCreated?: (s: {
		userId: string;
		userAgent?: string | null;
	}) => Promise<void>;
	passkeyAdded?: (userId: string) => Promise<void>;
	/** Runs before an account is deleted; an error stops the delete. */
	userDeleting?: (userId: string) => Promise<void>;
	/** Runs after an account is deleted (files on disk). */
	userDeleted?: (userId: string) => Promise<void>;
}

interface AuthDeps {
	env: Env;
	db: Db;
	redis: Redis;
	sendEmail: SendEmail;
	events?: AuthEvents;
}

export function createAuth({ env, db, redis, sendEmail, events }: AuthDeps) {
	const safely = (p: Promise<void> | undefined) =>
		void p?.catch(() => undefined);
	return betterAuth({
		appName: "Spendid",
		baseURL: env.APP_URL,
		basePath: "/api/auth",
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [env.APP_URL, ...env.EXTRA_ORIGINS],
		database: drizzleAdapter(db, { provider: "pg", schema }),
		secondaryStorage: redisStorage(redis),
		session: {
			storeSessionInDatabase: true,
			expiresIn: 60 * 60 * 24 * 30,
			updateAge: 60 * 60 * 24,
			cookieCache: { enabled: true, maxAge: 5 * 60 },
		},
		user: {
			// Members delete their own account from Settings (password required).
			deleteUser: { enabled: true },
		},
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			maxPasswordLength: 128,
			requireEmailVerification: true,
			resetPasswordTokenExpiresIn: 60 * 60,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }) =>
				sendEmail({
					type: "reset-password",
					to: user.email,
					name: user.name,
					url,
					userId: user.id,
				}),
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			expiresIn: 60 * 60 * 24,
			sendVerificationEmail: async ({ user, url }) =>
				sendEmail({
					type: "verify-email",
					to: user.email,
					name: user.name,
					url,
					userId: user.id,
				}),
		},
		rateLimit: {
			enabled: true,
			storage: "secondary-storage",
			window: 60,
			max: 100,
			customRules: {
				"/sign-in/email": { window: 60, max: 5 },
				"/sign-in/username": { window: 60, max: 5 },
				"/sign-up/email": { window: 60, max: 3 },
				"/request-password-reset": { window: 300, max: 3 },
				"/send-verification-email": { window: 300, max: 3 },
			},
		},
		hooks: {
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== "/passkey/verify-registration") return;
				const userId = ctx.context.session?.user.id;
				const ok =
					ctx.context.returned && !(ctx.context.returned instanceof Error);
				if (userId && ok) safely(events?.passkeyAdded?.(userId));
			}),
		},
		databaseHooks: {
			session: {
				create: {
					after: async (session) => {
						safely(
							events?.sessionCreated?.({
								userId: session.userId,
								userAgent: session.userAgent,
							}),
						);
					},
				},
			},
			user: {
				create: {
					// Every new person gets a profile row; onboarding fills it in.
					after: async (user) => {
						await db
							.insert(profile)
							.values({ userId: user.id })
							.onConflictDoNothing();
					},
				},
				// Self-delete and the admin's "remove" both come through here.
				delete: {
					before: async (user) => {
						await events?.userDeleting?.(user.id);
					},
					after: async (user) => {
						safely(events?.userDeleted?.(user.id));
					},
				},
			},
		},
		plugins: [
			username({ minUsernameLength: 3, maxUsernameLength: 30 }),
			admin({
				ac,
				roles: { admin: adminRole, user: userRole },
				defaultRole: "user",
				adminRoles: ["admin"],
			}),
			passkey({
				rpID: new URL(env.APP_URL).hostname,
				rpName: "Spendid",
				origin: env.APP_URL,
			}),
		],
		advanced: {
			cookiePrefix: "spendid",
			useSecureCookies: env.APP_URL.startsWith("https"),
			ipAddress: { ipAddressHeaders: [env.CLIENT_IP_HEADER] },
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;

/** Adapts Better Auth to the guards' SessionLookup. */
export function sessionLookup(auth: Auth): SessionLookup {
	return async (headers) =>
		(await auth.api.getSession({ headers }))?.user ?? null;
}
