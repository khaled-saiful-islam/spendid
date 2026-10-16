import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(url: string) {
	const sql = postgres(url, { max: 10, onnotice: () => {} });
	const db = drizzle(sql);
	return {
		db,
		ping: async (): Promise<boolean> =>
			(await sql`select 1 as ok`)[0]?.ok === 1,
		close: (): Promise<void> => sql.end({ timeout: 5 }),
	};
}
