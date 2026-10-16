import { createDb } from "@spendid/db";
import { loadEnv } from "../config/env";
import { seedAccounts } from "./accounts";
import { seedCategories } from "./categories";

// Runs on every `make up` after migrations. Production refuses admin/admin (see env.ts).
const env = loadEnv();
const database = createDb(env.DATABASE_URL, 2);
await seedCategories(database.db);
await database.close();

await seedAccounts([
	{
		name: "Spendid Admin",
		email: env.SEED_ADMIN_EMAIL,
		username: env.SEED_ADMIN_USERNAME,
		password: env.SEED_ADMIN_PASSWORD,
		role: "admin",
	},
]);
process.exit(0);
