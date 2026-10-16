import { expect, test } from "@playwright/test";
import { stateFile } from "./support/accounts";

test.use({ storageState: stateFile("admin") });

test("admin lands on the console and can't open member money pages", async ({ page }) => {
	await page.goto("/app");
	await expect(page).toHaveURL(/\/admin/);
	await page.goto("/app/activity");
	await expect(page).toHaveURL(/\/admin/);
});

test("admin API refuses member spending data", async ({ page }) => {
	const res = await page.request.get("/api/transactions");
	expect([401, 403]).toContain(res.status());
});
