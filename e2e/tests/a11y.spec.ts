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
	for (const path of ["/app", "/app/activity", "/app/plan", "/app/ask", "/app/family", "/app/me", "/app/wrapped"]) {
		test(`axe: ${path}`, async ({ page }) => {
			await page.goto(path);
			await expectNoSeriousIssues(page, path);
		});
	}
});

test.describe("admin", () => {
	test.use({ storageState: stateFile("admin") });
	test("axe: /admin", async ({ page }) => {
		await page.goto("/admin");
		await expectNoSeriousIssues(page, "/admin");
	});
});
