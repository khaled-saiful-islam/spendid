import { createDb, fxRate } from "@spendid/db";
import { afterAll, describe, expect, it } from "vitest";
import { testDbUrl } from "../../../test/db";
import { createFxRepository } from "./fx.repository";

const url = testDbUrl();

describe.skipIf(!url)("exchange rates (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const fx = createFxRepository(database.db);
	afterAll(() => database.close());

	it("converts a backdated expense at the rate of its own day", async () => {
		await database.db
			.insert(fxRate)
			.values([
				{ day: "2001-01-05", currency: "ISK", perEur: "100" },
				{ day: "2001-01-05", currency: "HUF", perEur: "200" },
				{ day: "2001-06-01", currency: "ISK", perEur: "50" },
				{ day: "2001-06-01", currency: "HUF", perEur: "200" },
			])
			.onConflictDoNothing();
		// 100 ISK in January: 1 EUR = 100 ISK = 200 HUF, so 200 HUF.
		const january = await fx.convert(
			10_000,
			"ISK",
			"HUF",
			new Date("2001-01-06T10:00:00Z"),
		);
		expect(january.homeMinor).toBe(20_000);
		// The same amount with June's rate is worth twice as much.
		const june = await fx.convert(
			10_000,
			"ISK",
			"HUF",
			new Date("2001-06-02T10:00:00Z"),
		);
		expect(june.homeMinor).toBe(40_000);
	});
});
