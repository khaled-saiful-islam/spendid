import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// The same `spendid_test` database the API tests use, created and migrated once.
		globalSetup: ["../api/test/global-setup.ts"],
		fileParallelism: false,
		hookTimeout: 30_000,
		testTimeout: 30_000,
	},
});
