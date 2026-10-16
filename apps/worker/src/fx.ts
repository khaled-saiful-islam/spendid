import { type Db, fxRate } from "@spendid/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const FX_QUEUE = "fx";
const SOURCE = "https://api.frankfurter.dev/v1/latest";

const LatestSchema = z.object({
	base: z.literal("EUR"),
	date: z.iso.date(),
	rates: z.record(z.string().length(3), z.number().positive()),
});

/** Pulls today's ECB reference rates (base EUR) and upserts them. Returns how many were stored. */
export async function refreshRates(
	db: Db,
	fetchImpl: typeof fetch = fetch,
): Promise<number> {
	const res = await fetchImpl(SOURCE, { signal: AbortSignal.timeout(15_000) });
	if (!res.ok) throw new Error(`rates source answered ${res.status}`);
	const latest = LatestSchema.parse(await res.json());

	const rows = Object.entries(latest.rates).map(([currency, perEur]) => ({
		day: latest.date,
		currency,
		perEur: String(perEur),
	}));
	await db
		.insert(fxRate)
		.values(rows)
		.onConflictDoUpdate({
			target: [fxRate.day, fxRate.currency],
			set: { perEur: sql`excluded.per_eur` },
		});
	return rows.length;
}
