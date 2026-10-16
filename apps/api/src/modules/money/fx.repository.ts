import { type Db, fxRate } from "@spendid/db";
import { convertMinor } from "@spendid/shared";
import { desc, inArray } from "drizzle-orm";
import { AppError } from "../../http/app-error";

export interface FxRepository {
	convert(
		amountMinor: number,
		from: string,
		to: string,
	): Promise<{ homeMinor: number; rate: number }>;
}

/** Converts with the newest stored ECB rates (refreshed by the worker). */
export function createFxRepository(db: Db): FxRepository {
	async function perEur(codes: string[]): Promise<Map<string, number>> {
		const wanted = codes.filter((c) => c !== "EUR");
		const rows = wanted.length
			? await db
					.selectDistinctOn([fxRate.currency], {
						currency: fxRate.currency,
						perEur: fxRate.perEur,
					})
					.from(fxRate)
					.where(inArray(fxRate.currency, wanted))
					.orderBy(fxRate.currency, desc(fxRate.day))
			: [];
		return new Map([
			["EUR", 1],
			...rows.map((r) => [r.currency, Number(r.perEur)] as [string, number]),
		]);
	}

	return {
		async convert(amountMinor, from, to) {
			if (from === to) return { homeMinor: amountMinor, rate: 1 };
			const rates = await perEur([from, to]);
			const fromPerEur = rates.get(from);
			const toPerEur = rates.get(to);
			if (!fromPerEur || !toPerEur) {
				const missing = fromPerEur ? to : from;
				throw new AppError(
					422,
					`We don't have an exchange rate for ${missing} yet. Log it in ${to} instead.`,
				);
			}
			return convertMinor({ amountMinor, from, to, fromPerEur, toPerEur });
		},
	};
}
