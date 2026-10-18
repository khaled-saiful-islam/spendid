import { expect, test } from "@playwright/test";

test("the landing page puts Get the app first, with no 'I have an account' link", async ({
	page,
	isMobile,
}) => {
	await page.goto("/");
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
	await expect(page.getByText("I have an account")).toHaveCount(0);
	if (isMobile) {
		await page.getByRole("button", { name: "Get the app, it's free" }).click();
	} else {
		await expect(page.getByText("Get Spendid on your phone")).toBeVisible();
		await page.getByRole("banner").getByRole("button", { name: "Get the app" }).click();
	}
	const sheet = page.getByRole("dialog", { name: "Get the Spendid app" });
	await expect(sheet.getByRole("img", { name: /^QR code that opens/ })).toBeVisible();
});
