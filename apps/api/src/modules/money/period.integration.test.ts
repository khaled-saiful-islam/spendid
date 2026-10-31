import { createDb, payCycle } from "@spendid/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";

const url = testDbUrl();

describe.skipIf(!url)("pay cycles (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 4);
	const db = database.db;
	let maya: string;

	beforeAll(async () => {
		maya = await createPerson(db);
	});
	afterAll(async () => {
		await database.close();
	});

	/** The constraint a write broke (Drizzle keeps the database error as `cause`). */
	const broken = async (write: Promise<unknown>): Promise<string> => {
		const err = await write.then(
			() => null,
			(e: unknown) => e,
		);
		const cause = (err as { cause?: { constraint_name?: string } } | null)
			?.cause;
		return cause?.constraint_name ?? (err ? String(err) : "nothing broke");
	};

	it("refuses overlapping cycles for one person", async () => {
		await db.insert(payCycle).values({
			userId: maya,
			startsOn: "2026-01-01",
			endsOn: "2026-01-31",
			incomeMinor: 1,
		});
		expect(
			await broken(
				db.insert(payCycle).values({
					userId: maya,
					startsOn: "2026-01-31",
					endsOn: "2026-02-27",
					incomeMinor: 1,
				}),
			),
		).toBe("pay_cycle_no_overlap");
	});

	it("refuses cycles under 7 or over 62 days", async () => {
		expect(
			await broken(
				db.insert(payCycle).values({
					userId: maya,
					startsOn: "2026-03-01",
					endsOn: "2026-03-06",
					incomeMinor: 1,
				}),
			),
		).toBe("pay_cycle_length");
		expect(
			await broken(
				db.insert(payCycle).values({
					userId: maya,
					startsOn: "2026-03-01",
					endsOn: "2026-05-02",
					incomeMinor: 1,
				}),
			),
		).toBe("pay_cycle_length");
	});

	it("lets a transaction move two cycles' shared edge (checked at commit)", async () => {
		const [a] = await db
			.insert(payCycle)
			.values({
				userId: maya,
				startsOn: "2026-06-01",
				endsOn: "2026-06-30",
				incomeMinor: 1,
			})
			.returning();
		const [b] = await db
			.insert(payCycle)
			.values({
				userId: maya,
				startsOn: "2026-07-01",
				endsOn: "2026-07-31",
				incomeMinor: 1,
			})
			.returning();
		await db.transaction(async (tx) => {
			await tx
				.update(payCycle)
				.set({ startsOn: "2026-06-25" })
				.where(eq(payCycle.id, b?.id ?? ""));
			await tx
				.update(payCycle)
				.set({ endsOn: "2026-06-24" })
				.where(eq(payCycle.id, a?.id ?? ""));
		});
		const rows = await db
			.select({ startsOn: payCycle.startsOn, endsOn: payCycle.endsOn })
			.from(payCycle)
			.where(eq(payCycle.userId, maya))
			.orderBy(payCycle.startsOn);
		expect(rows.slice(-2)).toEqual([
			{ startsOn: "2026-06-01", endsOn: "2026-06-24" },
			{ startsOn: "2026-06-25", endsOn: "2026-07-31" },
		]);
	});
});
