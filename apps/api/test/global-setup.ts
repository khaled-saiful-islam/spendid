import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { testDbUrl } from "./db";

/** Creates `spendid_test` (once) and applies every migration before the API tests run. */
export default async function setup(): Promise<void> {
	const url = testDbUrl();
	if (!url) return;
	const admin = new URL(url);
	admin.pathname = "/postgres";
	const server = postgres(admin.toString(), { max: 1, onnotice: () => {} });
	const [exists] =
		await server`select 1 from pg_database where datname = 'spendid_test'`;
	if (!exists) await server.unsafe("create database spendid_test");
	await server.end();

	const sql = postgres(url, { max: 1, onnotice: () => {} });
	const folder = fileURLToPath(
		new URL("../../../packages/db/drizzle", import.meta.url),
	);
	await migrate(drizzle(sql), { migrationsFolder: folder });
	await sql.end();
}
