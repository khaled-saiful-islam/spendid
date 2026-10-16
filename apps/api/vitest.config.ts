import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/global-setup.ts"],
		// Integration tests share one test database.
		fileParallelism: false,
		// Database setup hooks can be slow when the shared Docker VM is busy.
		hookTimeout: 30_000,
		testTimeout: 30_000,
	},
});
