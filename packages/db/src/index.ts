import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Db = ReturnType<typeof createDb>["db"];

/** One pool per process. `casing` maps camelCase properties to snake_case columns. */
export function createDb(url: string, max = 10) {
	const sql = postgres(url, { max, onnotice: () => {} });
	const db = drizzle(sql, { schema, casing: "snake_case" });
	return {
		db,
		ping: async (): Promise<boolean> =>
			(await sql`select 1 as ok`)[0]?.ok === 1,
		close: (): Promise<void> => sql.end({ timeout: 5 }),
	};
}
