import { z } from "zod";

const EnvSchema = z.object({
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
});

export type Env = z.infer<typeof EnvSchema>;

/** Parses process.env once at startup; exits with a readable list of what is wrong. */
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
