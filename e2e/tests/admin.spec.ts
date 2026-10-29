import { expect, test } from "@playwright/test";
import { stateFile } from "./support/accounts";

test.use({ storageState: stateFile("admin") });

test("admin lands on the console and can't open member money pages", async ({ page }) => {
	await page.goto("/app");
	await expect(page).toHaveURL(/\/admin/);
	await page.goto("/app/activity");
	await expect(page).toHaveURL(/\/admin/);
});

test("admin sends news to members", async ({ page }) => {
	const subject = `E2E news ${Date.now()}`;
	await page.goto("/admin");
	await page.getByRole("tab", { name: /announce|news/i }).click();
	await page.getByLabel("Subject").fill(subject);
	await page.getByLabel("Message").fill("A short note from the Spendid team.");
	await page.getByRole("button", { name: "Send to everyone" }).click();
	await expect(page.getByText(/^Sent to \d+ (person|people)\.$/)).toBeVisible();
	await expect(page.getByRole("listitem").filter({ hasText: subject })).toBeVisible();
});

test("admin API refuses member spending data", async ({ page }) => {
	const res = await page.request.get("/api/transactions");
	expect([401, 403]).toContain(res.status());
});
