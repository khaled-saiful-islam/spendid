import { loadEnv } from "../config/env";
import { seedAccounts } from "./accounts";

// Runs on every `make up` after migrations. Production refuses admin/admin (see env.ts).
const env = loadEnv();

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
