import { type AnyColumn, type SQL, sql } from "drizzle-orm";

/** Local midnight of `day` in `timeZone`, as a timestamptz. */
const startOf = (day: string | SQL, timeZone: string): SQL =>
	sql`((${day})::date::timestamp at time zone ${timeZone})`;

/**
 * `column` (a timestamptz) falls on the person's local days from `from` up to, not
 * including, `to`. Comparing the raw column (not its local date) lets Postgres use its index.
 */
export function onLocalDays(
	column: AnyColumn,
	timeZone: string,
	from: string | SQL,
	to: string | SQL,
): SQL {
	return sql`(${column} >= ${startOf(from, timeZone)} and ${column} < ${startOf(to, timeZone)})`;
}
