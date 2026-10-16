import { type Db, profile, user } from "@spendid/db";
import type { Locale, Me, ProfileInput } from "@spendid/shared";
import { eq, sql } from "drizzle-orm";

export interface MeRepository {
	find(userId: string): Promise<Me | null>;
	saveProfile(userId: string, input: ProfileInput): Promise<Me>;
	/** Just the app language, from Settings. */
	setLocale(userId: string, locale: Locale): Promise<Me>;
}

/** Reads and writes only the signed-in person's own account + profile. */
export function createMeRepository(db: Db): MeRepository {
	async function find(userId: string): Promise<Me | null> {
		const [row] = await db
			.select({ user, profile })
			.from(user)
			.leftJoin(profile, eq(profile.userId, user.id))
			.where(eq(user.id, userId))
			.limit(1);
		if (!row) return null;

		const p = row.profile;
		return {
			user: {
				id: row.user.id,
				name: row.user.name,
				email: row.user.email,
				username: row.user.username,
				role: row.user.role === "admin" ? "admin" : "user",
				emailVerified: row.user.emailVerified,
			},
			profile: {
				homeCurrency: p?.homeCurrency ?? "MYR",
				locale: p?.locale === "ms" ? "ms" : "en",
				timeZone: p?.timeZone ?? "Asia/Kuala_Lumpur",
				monthlyIncomeMinor: p?.monthlyIncomeMinor ?? null,
				budgetMethod: p?.budgetMethod ?? "fifty_thirty_twenty",
				onboardedAt: p?.onboardedAt?.toISOString() ?? null,
			},
			needsOnboarding: row.user.role !== "admin" && !p?.onboardedAt,
		};
	}

	async function saveProfile(userId: string, input: ProfileInput): Promise<Me> {
		const { name, ...money } = input;
		await db.transaction(async (tx) => {
			await tx.update(user).set({ name }).where(eq(user.id, userId));
			await tx
				.insert(profile)
				.values({ userId, ...money, onboardedAt: new Date() })
				.onConflictDoUpdate({
					target: profile.userId,
					set: {
						...money,
						onboardedAt: sql`coalesce(${profile.onboardedAt}, now())`,
					},
				});
		});
		const me = await find(userId);
		if (!me) throw new Error("profile saved but account not found");
		return me;
	}

	async function setLocale(userId: string, locale: Locale): Promise<Me> {
		await db.update(profile).set({ locale }).where(eq(profile.userId, userId));
		const me = await find(userId);
		if (!me) throw new Error("profile vanished");
		return me;
	}

	return { find, saveProfile, setLocale };
}
