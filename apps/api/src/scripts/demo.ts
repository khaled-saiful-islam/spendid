import { createDb } from "@spendid/db";
import { loadEnv } from "../config/env";
import { seedAccounts } from "./accounts";
import { seedDemoMonth } from "./demo-month";

// `make demo` — normal (non-admin) people for testing. Password for all: demo1234
await seedAccounts([
	{
		name: "Maya Tan",
		email: "maya@demo.spendid.local",
		username: "maya",
		password: "demo1234",
		role: "user",
		profile: {
			homeCurrency: "MYR",
			locale: "en",
			timeZone: "Asia/Kuala_Lumpur",
			monthlyIncomeMinor: 650_000,
			budgetMethod: "fifty_thirty_twenty",
		},
	},
	{
		name: "Adam Rahman",
		email: "adam@demo.spendid.local",
		username: "adam",
		password: "demo1234",
		role: "user",
	},
]);

const database = createDb(loadEnv().DATABASE_URL, 2);
await seedDemoMonth(database.db, "maya");
await database.close();
process.exit(0);
