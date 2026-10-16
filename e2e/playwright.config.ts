import { defineConfig, devices } from "@playwright/test";

/** Where the running app lives. `make up` serves it on 8600. */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8600";

export default defineConfig({
	testDir: "./tests",
	// One worker: every test shares the dev database and the sign-in rate limit.
	workers: 1,
	fullyParallel: false,
	retries: 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [["list"], ["html", { open: "never" }]],
	globalSetup: "./global-setup.ts",
	use: {
		baseURL: BASE_URL,
		locale: "en-MY",
		timezoneId: "Asia/Kuala_Lumpur",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "phone",
			use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
		},
		{
			name: "desktop",
			use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
			// The long sign-up journey runs once, on the phone.
			testIgnore: /signup\.spec\.ts/,
		},
	],
});
