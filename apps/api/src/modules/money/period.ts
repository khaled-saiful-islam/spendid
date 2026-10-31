import { type Db, payCycle, profile } from "@spendid/db";
import {
	addDays,
	type CycleStatus,
	daysInclusive,
	draftsUntil,
	type PeriodKind,
} from "@spendid/shared";
import { and, desc, eq, gte, lte } from "drizzle-orm";

/** The period the plan's numbers cover, in the person's own days (end included). */
export interface PeriodBounds {
	kind: PeriodKind;
	today: string;
	start: string;
	end: string;
	/** The day after `end`, for "before this day" queries. */
	nextStart: string;
	days: number;
	/** Days left, today included (at least 1). */
	daysLeft: number;
	/** The cycle's salary; for the calendar month, the profile's monthly income. */
	incomeMinor: number | null;
	cycleId: string | null;
	status: CycleStatus | null;
}

interface CycleRow {
	id: string;
	startsOn: string;
	endsOn: string;
	incomeMinor: number;
	status: CycleStatus;
}

/** Today (YYYY-MM-DD) in `timeZone`. */
export function localDay(timeZone: string, at: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
}

/** The calendar month around `today`. */
export function calendarMonth(
	today: string,
	incomeMinor: number | null,
): PeriodBounds {
	const start = `${today.slice(0, 8)}01`;
	const [y, m] = today.split("-").map(Number) as [number, number];
	const nextStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
	const end = addDays(nextStart, -1);
	return {
		kind: "month",
		today,
		start,
		end,
		nextStart,
		days: daysInclusive(start, end),
		daysLeft: daysInclusive(today, end),
		incomeMinor,
		cycleId: null,
		status: null,
	};
}

export function cycleBounds(today: string, row: CycleRow): PeriodBounds {
	return {
		kind: "cycle",
		today,
		start: row.startsOn,
		end: row.endsOn,
		nextStart: addDays(row.endsOn, 1),
		days: daysInclusive(row.startsOn, row.endsOn),
		daysLeft: daysInclusive(today, row.endsOn),
		incomeMinor: row.incomeMinor,
		cycleId: row.id,
		status: row.status,
	};
}

const cycleColumns = {
	id: payCycle.id,
	startsOn: payCycle.startsOn,
	endsOn: payCycle.endsOn,
	incomeMinor: payCycle.incomeMinor,
	status: payCycle.status,
};

async function covering(
	db: Db,
	userId: string,
	today: string,
): Promise<CycleRow | null> {
	const [row] = await db
		.select(cycleColumns)
		.from(payCycle)
		.where(
			and(
				eq(payCycle.userId, userId),
				lte(payCycle.startsOn, today),
				gte(payCycle.endsOn, today),
			),
		)
		.limit(1);
	return row ?? null;
}

/** Drafts cycles after the last one until one covers today. One person at a time (row lock). */
async function draftUpTo(
	db: Db,
	userId: string,
	today: string,
): Promise<CycleRow | null> {
	return db.transaction(async (txRaw) => {
		const tx = txRaw as unknown as Db;
		await tx
			.select({ id: profile.userId })
			.from(profile)
			.where(eq(profile.userId, userId))
			.for("update");
		const found = await covering(tx, userId, today);
		if (found) return found;
		const [last] = await tx
			.select(cycleColumns)
			.from(payCycle)
			.where(eq(payCycle.userId, userId))
			.orderBy(desc(payCycle.startsOn))
			.limit(1);
		if (!last || last.endsOn >= today) return null;
		const made = await tx
			.insert(payCycle)
			.values(
				draftsUntil(last, today).map((d) => ({
					userId,
					...d,
					incomeMinor: last.incomeMinor,
					status: "draft" as const,
				})),
			)
			.returning(cycleColumns);
		return made.at(-1) ?? null;
	});
}

/** The current period: the cycle covering today (drafting it if the last one ended), or the calendar month. */
export async function periodBounds(
	db: Db,
	userId: string,
	at: Date = new Date(),
): Promise<PeriodBounds> {
	const [p] = await db
		.select({
			period: profile.period,
			timeZone: profile.timeZone,
			incomeMinor: profile.monthlyIncomeMinor,
		})
		.from(profile)
		.where(eq(profile.userId, userId))
		.limit(1);
	const today = localDay(p?.timeZone ?? "UTC", at);
	const income = p?.incomeMinor ?? null;
	if (p?.period !== "cycle") return calendarMonth(today, income);
	const current =
		(await covering(db, userId, today)) ?? (await draftUpTo(db, userId, today));
	return current ? cycleBounds(today, current) : calendarMonth(today, income);
}

/** The period just before `bounds`: the previous cycle, else the previous calendar month. */
export async function previousPeriod(
	db: Db,
	userId: string,
	bounds: PeriodBounds,
): Promise<{ kind: PeriodKind; start: string; end: string }> {
	if (bounds.kind === "cycle") {
		const [row] = await db
			.select({ startsOn: payCycle.startsOn, endsOn: payCycle.endsOn })
			.from(payCycle)
			.where(
				and(
					eq(payCycle.userId, userId),
					eq(payCycle.endsOn, addDays(bounds.start, -1)),
				),
			)
			.limit(1);
		if (row) return { kind: "cycle", start: row.startsOn, end: row.endsOn };
	}
	const lastMonth = calendarMonth(
		addDays(`${bounds.today.slice(0, 8)}01`, -1),
		null,
	);
	return { kind: "month", start: lastMonth.start, end: lastMonth.end };
}
