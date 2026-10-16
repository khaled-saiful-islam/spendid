import { seedAccounts } from "./accounts";

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
process.exit(0);
