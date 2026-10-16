import { expect, test } from "@playwright/test";
import { linkIn, waitForEmail } from "./support/mailpit";

/**
 * A brand-new person: sign up, confirm the email from the inbox, set up,
 * see today's number, then delete the account so the dev database stays clean.
 */
test("sign up, confirm email, set up, then delete the account", async ({ page }) => {
	const stamp = Date.now();
	const email = `e2e.${stamp}@example.com`;
	const password = `E2e-pass-${stamp}`;

	await page.goto("/signup");
	await page.getByLabel("Your name").fill("E2E Tester");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL(/\/check-email/);

	// Signing in before confirming is refused.
	await page.goto("/signin");
	await page.getByLabel("Email or username").fill(email);
	await page.getByLabel("Password", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("Confirm your email first");

	const confirm = await waitForEmail(page.request, email, /Confirm your email/);
	await page.goto(linkIn(confirm, "/verify-email"));
	await page.goto("/app");
	await expect(page).toHaveURL(/\/onboarding/);

	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByLabel("Take-home pay each month").fill("5000");
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Show my safe-to-spend" }).click();
	await expect(page).toHaveURL(/\/app$/);
	await expect(page.getByText("Safe to spend today").first()).toBeVisible();

	await page.goto("/app/me");
	await page.getByRole("button", { name: "Delete my account" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByLabel("Your password").fill(password);
	await sheet.getByLabel("Type DELETE to confirm").fill("DELETE");
	await sheet.getByRole("button", { name: "Delete my account forever" }).click();
	await expect(page.getByText("Your account and everything in it is deleted.")).toBeVisible();
	await waitForEmail(page.request, email, /account is deleted/);
});
