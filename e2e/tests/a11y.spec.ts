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

	test("axe: the alerts bell with more than 9 new", async ({ page }) => {
		// Many unread alerts show "9+"; the badge must be readable and its name must say so.
		await page.route("**/api/notices", async (route) => {
			const res = await route.fetch();
			const body = await res.json();
			body.data.unread = 12;
			await route.fulfill({ response: res, json: body });
		});
		await page.goto("/app");
		await expect(page.getByRole("button", { name: "Alerts, 9+ new" }).first()).toBeVisible();
		await expectNoSeriousIssues(page, "/app with 12 new alerts");
	});

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
