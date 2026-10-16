import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const folder = fileURLToPath(new URL("../drizzle", import.meta.url));

await migrate(drizzle(sql), { migrationsFolder: folder });
process.stdout.write("[db] migrations applied\n");
await sql.end();
