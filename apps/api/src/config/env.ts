import { z } from "zod";

const PLACEHOLDER_SECRET = "change-me-to-a-long-random-string";

const EnvSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		LOG_LEVEL: z
			.enum(["fatal", "error", "warn", "info", "debug", "trace"])
			.default("info"),
		API_PORT: z.coerce.number().int().positive().default(8601),
		APP_URL: z.url().default("http://localhost:8600"),
		DATABASE_URL: z.string().startsWith("postgres"),
		REDIS_URL: z.string().startsWith("redis"),
		BETTER_AUTH_SECRET: z.string().min(32),
		SEED_ADMIN_USERNAME: z.string().min(3).default("admin"),
		SEED_ADMIN_PASSWORD: z.string().min(1).default("admin"),
		SEED_ADMIN_EMAIL: z.email().default("admin@spendid.local"),
	})
	.superRefine((env, ctx) => {
		if (env.NODE_ENV !== "production") return;
		if (env.BETTER_AUTH_SECRET === PLACEHOLDER_SECRET) {
			ctx.addIssue({
				code: "custom",
				path: ["BETTER_AUTH_SECRET"],
				message: "set a real secret in production",
			});
		}
		if (
			env.SEED_ADMIN_PASSWORD === "admin" ||
			env.SEED_ADMIN_PASSWORD.length < 12
		) {
			ctx.addIssue({
				code: "custom",
				path: ["SEED_ADMIN_PASSWORD"],
				message: "use a strong admin password (12+ characters) in production",
			});
		}
	});

export type Env = z.infer<typeof EnvSchema>;

/** Parses process.env once at startup; throws a readable list of what is wrong. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
	const parsed = EnvSchema.safeParse(source);
	if (!parsed.success) {
		const problems = parsed.error.issues.map(
			(i) => `  - ${i.path.join(".")}: ${i.message}`,
		);
		throw new Error(`Invalid environment:\n${problems.join("\n")}`);
	}
	return parsed.data;
}
