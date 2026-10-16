import { type APIRequestContext, expect, test } from "@playwright/test";
import { stateFile } from "./support/accounts";

/** Removes expenses an earlier, interrupted run may have left behind. */
async function removeLeftovers(request: APIRequestContext, shop: string): Promise<void> {
	const res = await request.get("/api/transactions", { params: { q: shop, limit: 50 } });
	expect(res.ok()).toBe(true);
	const { data } = (await res.json()) as { data: { items: { id: string; merchant: string | null }[] } };
	for (const tx of data.items.filter((t) => t.merchant === shop)) {
		await request.delete(`/api/transactions/${tx.id}`, { headers: { "content-type": "application/json" }, data: {} });
	}
}

test.use({ storageState: stateFile("maya") });

test("home shows today's safe-to-spend and Pip", async ({ page }) => {
	await page.goto("/app");
	await expect(page.getByText("Safe to spend today").first()).toBeVisible();
	await expect(page.getByRole("img", { name: /Pip the pangolin/ }).first()).toBeVisible();
});

test("add an expense by typing, see it in Activity, then remove it", async ({ page }) => {
	// One fixed name, so repeat runs reuse a single remembered shop. The test removes its expense.
	const shop = "Playwright test shop";
	await removeLeftovers(page.request, shop);
	await page.goto("/app");
	await page.getByRole("button", { name: /^Add spending/ }).click();
	await page
		.getByRole("dialog", { name: "Add spending" })
		.getByRole("button", { name: /^Type it/ })
		.click();
	const sheet = page.getByRole("dialog", { name: "Add an expense" });
	await sheet.getByLabel("What was it?").fill(shop);
	await sheet.getByLabel("Amount").fill("12.50");
	await sheet.getByRole("button", { name: "Groceries" }).click();
	await sheet.getByRole("button", { name: "Add RM 12.50" }).click();
	await expect(sheet).toBeHidden();

	await page.goto("/app/activity");
	const row = page.getByText(shop).first();
	await expect(row).toBeVisible();
	await row.click();
	await page.getByRole("dialog").getByRole("button", { name: "Remove this expense" }).click();
	await expect(page.getByText("Expense removed.")).toBeVisible();
	await expect(page.getByText(shop)).toHaveCount(0);
});

test("hide amounts blurs every number until shown again", async ({ page }) => {
	await page.goto("/app");
	await page.getByRole("button", { name: "Hide amounts" }).click();
	await expect(page.locator("html")).toHaveAttribute("data-hide-money", /.*/);
	await page.getByRole("button", { name: "Show amounts" }).click();
	await expect(page.locator("html")).not.toHaveAttribute("data-hide-money", /.*/);
});

test("Ask Spendid opens with real numbers and example questions", async ({ page }) => {
	await page.goto("/app/ask");
	await expect(page.getByRole("textbox").first()).toBeVisible();
	await expect(page.getByText(/this month|today/i).first()).toBeVisible();
});

test("Family shows the circle and what each side shares", async ({ page }) => {
	await page.goto("/app/family");
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	await expect(page.getByText("Adam").first()).toBeVisible();
});

test("no page scrolls sideways on this screen size", async ({ page }) => {
	for (const path of ["/app", "/app/activity", "/app/plan", "/app/ask", "/app/family", "/app/me"]) {
		await page.goto(path);
		await page.waitForLoadState("networkidle");
		const wide = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth + 1,
		);
		expect(wide, `${path} scrolls sideways`).toBe(false);
	}
});
