import { createDb, payCycle, profile } from "@spendid/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { periodBounds, previousPeriod } from "./period";

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

	const toCycle = async (
		userId: string,
		rows: { startsOn: string; endsOn: string; incomeMinor?: number }[],
	) => {
		await db
			.update(profile)
			.set({ period: "cycle" })
			.where(eq(profile.userId, userId));
		await db
			.insert(payCycle)
			.values(rows.map((r) => ({ userId, incomeMinor: 450_000, ...r })));
	};
	// 04:00 UTC is noon in Kuala Lumpur.
	const noon31Oct = new Date("2026-10-31T04:00:00Z");

	it("is the calendar month for someone without cycles", async () => {
		const sam = await createPerson(db);
		expect(await periodBounds(db, sam, noon31Oct)).toMatchObject({
			kind: "month",
			today: "2026-10-31",
			start: "2026-10-01",
			end: "2026-10-31",
			nextStart: "2026-11-01",
			days: 31,
			daysLeft: 1,
			incomeMinor: 600_000,
			cycleId: null,
			status: null,
		});
	});

	it("is the cycle covering today, with its own salary", async () => {
		const ali = await createPerson(db);
		await toCycle(ali, [
			{ startsOn: "2026-10-29", endsOn: "2026-11-28", incomeMinor: 512_300 },
		]);
		expect(await periodBounds(db, ali, noon31Oct)).toMatchObject({
			kind: "cycle",
			start: "2026-10-29",
			end: "2026-11-28",
			nextStart: "2026-11-29",
			days: 31,
			daysLeft: 29,
			incomeMinor: 512_300,
			status: "set",
		});
	});

	it("uses the person's own day at midnight", async () => {
		const zara = await createPerson(db);
		await toCycle(zara, [
			{ startsOn: "2026-09-29", endsOn: "2026-10-28" },
			{ startsOn: "2026-10-29", endsOn: "2026-11-28" },
		]);
		// 16:30 UTC on 28 Oct is 00:30 on 29 Oct in Kuala Lumpur.
		const b = await periodBounds(db, zara, new Date("2026-10-28T16:30:00Z"));
		expect(b.today).toBe("2026-10-29");
		expect(b.start).toBe("2026-10-29");
	});

	it("drafts the next cycle when the last one has ended", async () => {
		const lee = await createPerson(db);
		await toCycle(lee, [
			{ startsOn: "2026-09-29", endsOn: "2026-10-28", incomeMinor: 400_000 },
		]);
		expect(await periodBounds(db, lee, noon31Oct)).toMatchObject({
			start: "2026-10-29",
			end: "2026-11-27",
			incomeMinor: 400_000,
			status: "draft",
		});
	});

	it("drafts several cycles after a long absence", async () => {
		const ben = await createPerson(db);
		await toCycle(ben, [{ startsOn: "2026-07-01", endsOn: "2026-07-30" }]);
		const b = await periodBounds(db, ben, noon31Oct);
		const rows = await db
			.select()
			.from(payCycle)
			.where(eq(payCycle.userId, ben))
			.orderBy(payCycle.startsOn);
		expect(rows.map((r) => [r.startsOn, r.endsOn, r.status])).toEqual([
			["2026-07-01", "2026-07-30", "set"],
			["2026-07-31", "2026-08-29", "draft"],
			["2026-08-30", "2026-09-28", "draft"],
			["2026-09-29", "2026-10-28", "draft"],
			["2026-10-29", "2026-11-27", "draft"],
		]);
		expect(b.start).toBe("2026-10-29");
	});

	it("drafts once under parallel requests", async () => {
		const ida = await createPerson(db);
		await toCycle(ida, [{ startsOn: "2026-09-29", endsOn: "2026-10-28" }]);
		const all = await Promise.all(
			Array.from({ length: 6 }, () => periodBounds(db, ida, noon31Oct)),
		);
		expect(new Set(all.map((b) => b.cycleId)).size).toBe(1);
		const rows = await db
			.select()
			.from(payCycle)
			.where(eq(payCycle.userId, ida));
		expect(rows).toHaveLength(2);
	});

	it("knows the period before: last calendar month, or the cycle before", async () => {
		const ann = await createPerson(db);
		const month = await periodBounds(db, ann, noon31Oct);
		expect(await previousPeriod(db, ann, month)).toEqual({
			kind: "month",
			start: "2026-09-01",
			end: "2026-09-30",
		});
		await toCycle(ann, [
			{ startsOn: "2026-09-29", endsOn: "2026-10-28" },
			{ startsOn: "2026-10-29", endsOn: "2026-11-28" },
		]);
		const cycle = await periodBounds(db, ann, noon31Oct);
		expect(await previousPeriod(db, ann, cycle)).toEqual({
			kind: "cycle",
			start: "2026-09-29",
			end: "2026-10-28",
		});
	});

	it("falls back to last calendar month before the first cycle", async () => {
		const joe = await createPerson(db);
		await toCycle(joe, [{ startsOn: "2026-10-29", endsOn: "2026-11-28" }]);
		const cycle = await periodBounds(db, joe, noon31Oct);
		expect(await previousPeriod(db, joe, cycle)).toEqual({
			kind: "month",
			start: "2026-09-01",
			end: "2026-09-30",
		});
	});
});
