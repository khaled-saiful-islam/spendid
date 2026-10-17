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
		/**
		 * More addresses the web app is opened from, comma-separated, e.g. this computer's
		 * Wi-Fi address for testing on a phone (http://192.168.1.20:8600). Sign-in accepts them.
		 */
		EXTRA_ORIGINS: z
			.string()
			.default("")
			.transform((s) =>
				s
					.split(",")
					.map((o) => o.trim())
					.filter(Boolean),
			)
			.pipe(z.array(z.url())),
		/**
		 * The request header that carries the visitor's IP, for per-IP sign-in limits.
		 * Behind Cloudflare use "cf-connecting-ip" (Cloudflare sets it; visitors can't fake it).
		 */
		CLIENT_IP_HEADER: z
			.string()
			.min(1)
			.toLowerCase()
			.default("x-forwarded-for"),
		DATABASE_URL: z.string().startsWith("postgres"),
		REDIS_URL: z.string().startsWith("redis"),
		BETTER_AUTH_SECRET: z.string().min(32),
		SEED_ADMIN_USERNAME: z.string().min(3).default("admin"),
		SEED_ADMIN_PASSWORD: z.string().min(1).default("admin"),
		SEED_ADMIN_EMAIL: z.email().default("admin@spendid.local"),
		// ILMU (OpenAI-compatible). An empty key turns AI features off; typing still works.
		ILMU_BASE_URL: z.url().default("https://api.ilmu.ai/v1"),
		ILMU_API_KEY: z.string().default(""),
		ILMU_TEXT_MODEL: z.string().min(1).default("ilmu-v3.1"),
		ILMU_VISION_MODEL: z.string().min(1).default("ilmu-vision-v1.3"),
		ILMU_ASR_MODEL: z.string().min(1).default("ilmu-asr-v4.2"),
		RECEIPTS_DIR: z.string().min(1).default("/data/receipts"),
		// 32 random bytes, base64. Empty turns receipt scanning off.
		RECEIPT_ENCRYPTION_KEY: z.string().default(""),
		AI_MONTHLY_TOKENS_DEFAULT: z.coerce.number().int().min(0).default(200_000),
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
