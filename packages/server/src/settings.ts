import { appSetting, type Db } from "@spendid/db";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { z } from "zod";

export const AppSettingsSchema = z.object({
	/** Global AI switch: off stops voice, receipts and Ask for everyone (typing still works). */
	aiEnabled: z.boolean(),
	/** Monthly AI allowance for people without their own limit. */
	defaultMonthlyTokens: z.number().int().min(0).max(100_000_000),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

const KEY = "app";
const CACHE_KEY = "app:settings";
const CACHE_SECONDS = 30;

/** Settings live in Postgres, cached briefly in Redis so every AI call can check them cheaply. */
export function createAppSettings(deps: {
	db: Db;
	redis: Redis;
	defaults: AppSettings;
}) {
	async function get(): Promise<AppSettings> {
		const cached = await deps.redis.get(CACHE_KEY);
		if (cached) {
			const parsed = AppSettingsSchema.safeParse(JSON.parse(cached));
			if (parsed.success) return parsed.data;
		}
		const [row] = await deps.db
			.select()
			.from(appSetting)
			.where(eq(appSetting.key, KEY))
			.limit(1);
		const stored = row
			? AppSettingsSchema.partial().safeParse(row.value)
			: null;
		const settings = {
			...deps.defaults,
			...(stored?.success ? stored.data : {}),
		};
		await deps.redis.set(
			CACHE_KEY,
			JSON.stringify(settings),
			"EX",
			CACHE_SECONDS,
		);
		return settings;
	}

	async function set(
		patch: Partial<AppSettings>,
		actorId: string,
	): Promise<AppSettings> {
		const next = AppSettingsSchema.parse({ ...(await get()), ...patch });
		await deps.db
			.insert(appSetting)
			.values({ key: KEY, value: next, updatedBy: actorId })
			.onConflictDoUpdate({
				target: appSetting.key,
				set: { value: next, updatedBy: actorId },
			});
		await deps.redis.set(CACHE_KEY, JSON.stringify(next), "EX", CACHE_SECONDS);
		return next;
	}

	return { get, set };
}

export type AppSettingsStore = ReturnType<typeof createAppSettings>;
