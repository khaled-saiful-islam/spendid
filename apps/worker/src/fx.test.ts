import type { Db } from "@spendid/db";
import { describe, expect, it } from "vitest";
import { refreshRates } from "./fx";

function fakeDb() {
	const stored: unknown[] = [];
	const db = {
		insert: () => ({
			values: (rows: unknown[]) => {
				stored.push(...rows);
				return { onConflictDoUpdate: async () => undefined };
			},
		}),
	} as unknown as Db;
	return { db, stored };
}

const reply = (body: unknown, status = 200) =>
	(async () =>
		new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("refreshRates", () => {
	it("stores one row per currency for the published day", async () => {
		const { db, stored } = fakeDb();
		const count = await refreshRates(
			db,
			reply({
				base: "EUR",
				date: "2026-10-15",
				rates: { MYR: 4.5757, USD: 1.1208 },
			}),
		);
		expect(count).toBe(2);
		expect(stored).toContainEqual({
			day: "2026-10-15",
			currency: "MYR",
			perEur: "4.5757",
		});
	});

	it("refuses a malformed answer instead of storing junk", async () => {
		const { db, stored } = fakeDb();
		await expect(
			refreshRates(db, reply({ base: "USD", date: "x", rates: {} })),
		).rejects.toThrow();
		expect(stored).toHaveLength(0);
	});

	it("fails loudly when the source is down", async () => {
		const { db } = fakeDb();
		await expect(refreshRates(db, reply({}, 503))).rejects.toThrow(/503/);
	});
});
