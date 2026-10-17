import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { stateFile } from "./support/accounts";

/** Fails on serious or critical WCAG 2.2 AA problems; lists each one with where it is. */
async function expectNoSeriousIssues(page: Page, label: string): Promise<void> {
	await page.waitForLoadState("networkidle");
	// Let entrance animations settle so colour contrast is measured on the final look.
	await page.waitForTimeout(800);
	const { violations } = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
		.analyze();
	const serious = violations
		.filter((v) => v.impact === "serious" || v.impact === "critical")
		.map(
			(v) =>
				`${v.id}: ${v.help} → ${v.nodes
					.slice(0, 3)
					.map((n) => `${n.html.slice(0, 140)} (${n.failureSummary?.split("\n")[1]?.trim() ?? ""})`)
					.join(" | ")}`,
		);
	expect(serious, `${label} has accessibility problems`).toEqual([]);
}

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
