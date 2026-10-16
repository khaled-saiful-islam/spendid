/** Demo accounts from `make demo`. Override with env vars when testing another seed. */
export const ACCOUNTS = {
	maya: {
		username: process.env.E2E_MEMBER_USER ?? "maya",
		password: process.env.E2E_MEMBER_PASSWORD ?? "demo1234",
	},
	admin: {
		username: process.env.E2E_ADMIN_USER ?? "admin",
		password: process.env.E2E_ADMIN_PASSWORD ?? "admin",
	},
} as const;

export type AccountName = keyof typeof ACCOUNTS;

export const stateFile = (name: AccountName): string => `.auth/${name}.json`;
