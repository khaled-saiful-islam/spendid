import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Fails on serious or critical WCAG 2.2 AA problems; lists each one with where it is. */
export async function expectNoSeriousIssues(page: Page, label: string): Promise<void> {
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
