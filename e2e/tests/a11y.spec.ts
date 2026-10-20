import { expect, test } from "@playwright/test";
import { stateFile } from "./support/accounts";
import { expectNoSeriousIssues } from "./support/axe";

// Judge the settled screen, not a frame in the middle of an animation.
test.use({ reducedMotion: "reduce" });

test.describe("signed out", () => {
	for (const path of ["/", "/signin", "/signup", "/forgot"]) {
		test(`axe: ${path}`, async ({ page }) => {
			await page.goto(path);
			await expectNoSeriousIssues(page, path);
		});
	}
});

test.describe("member", () => {
	test.use({ storageState: stateFile("maya") });
	for (const path of [
		"/app",
		"/app/activity",
		"/app/activity?view=insights",
		"/app/plan",
		"/app/subscriptions",
		"/app/ask",
		"/app/family",
		"/app/me",
		"/app/wrapped",
	]) {
		test(`axe: ${path}`, async ({ page }) => {
			await page.goto(path);
			await expectNoSeriousIssues(page, path);
		});
	}

	test("keyboard focus stays inside an open sheet, and Esc closes it", async ({
		page,
	}) => {
		await page.goto("/app");
		const opener = page.getByRole("button", { name: /^Add spending/ });
		await opener.click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		for (let i = 0; i < 25; i++) {
			await page.keyboard.press(i % 5 === 4 ? "Shift+Tab" : "Tab");
			expect(
				await dialog.evaluate((d) => d.contains(document.activeElement)),
			).toBe(true);
		}
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(opener).toBeFocused();
	});
});

test.describe("admin", () => {
	test.use({ storageState: stateFile("admin") });
	test("axe: /admin", async ({ page }) => {
		await page.goto("/admin");
		await expectNoSeriousIssues(page, "/admin");
	});
});
