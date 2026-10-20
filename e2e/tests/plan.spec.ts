import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { stateFile } from "./support/accounts";
import { expectNoSeriousIssues } from "./support/axe";

/**
 * Plans end to end: pay yourself first (salary − transfers = what's left to spend), and a plan
 * being optional. Every test puts Maya's plan, income and transfers back as they were.
 */

test.use({ storageState: stateFile("maya") });

type Method = "envelope" | "zero_based" | "fifty_thirty_twenty" | "pay_yourself_first";

interface Profile {
	homeCurrency: string;
	locale: "en" | "ms";
	timeZone: string;
	monthlyIncomeMinor: number | null;
	budgetMethod: Method | null;
}
interface Transfer {
	name: string;
	amountMinor: number;
}
interface Summary {
	method: Method | null;
	incomeMinor: number | null;
	reservedMinor: number;
	transfers: Transfer[];
	monthSpentMinor: number;
	safe: { leftThisMonthMinor: number };
	bills: { minor: number };
}

const data = async <T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> => {
	expect(res.ok(), `${res.url()} → ${res.status()}`).toBe(true);
	return ((await res.json()) as { data: T }).data;
};
const getMe = async (r: APIRequestContext) =>
	data<{ user: { name: string }; profile: Profile }>(await r.get("/api/me"));
const getTransfers = (r: APIRequestContext) => r.get("/api/transfers").then((x) => data<Transfer[]>(x));
const getSummary = (r: APIRequestContext) => r.get("/api/summary").then((x) => data<Summary>(x));
const goalsMonthly = async (r: APIRequestContext) =>
	(await data<{ monthlyNeededMinor: number }[]>(await r.get("/api/goals"))).reduce(
		(s, g) => s + g.monthlyNeededMinor,
		0,
	);

async function setPlan(r: APIRequestContext, method: Method | null, extra: Partial<Profile> = {}) {
	const { user, profile } = await getMe(r);
	const { onboardedAt: _o, ...rest } = profile as Profile & { onboardedAt?: string };
	await data(await r.put("/api/me/profile", { data: { ...rest, ...extra, name: user.name, budgetMethod: method } }));
}
async function setTransfers(r: APIRequestContext, list: Transfer[]) {
	await data(await r.put("/api/transfers", { data: list }));
}

/** "5,699.50" for 569950, as the app shows it in en-MY. */
const amount = (minor: number) =>
	(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (minor: number) => new RegExp(`RM\\s?${amount(minor).replace(/[.,]/g, "\\$&")}`);

/** Safe to spend must always be exactly income − kept aside − bills still due − spent. */
function expectSumsUp(s: Summary) {
	expect(s.safe.leftThisMonthMinor).toBe(
		(s.incomeMinor ?? 0) - s.reservedMinor - s.bills.minor - s.monthSpentMinor,
	);
}

async function toPlanStep(page: Page) {
	await page.goto("/onboarding?edit=true");
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Continue" }).click();
	await expect(page.getByRole("heading", { name: "How do you like to budget?" })).toBeVisible();
}
const planCard = (page: Page, title: string) => page.locator("label").filter({ hasText: title });
const visible = (page: Page, text: string | RegExp) =>
	page.getByText(text).filter({ visible: true }).first();

async function expectNoSidewaysScroll(page: Page, label: string) {
	const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
	expect(wide, `${label} scrolls sideways`).toBe(false);
}

let saved: { profile: Profile; name: string; transfers: Transfer[] };

test.beforeEach(async ({ request }) => {
	const me = await getMe(request);
	saved = { profile: me.profile, name: me.user.name, transfers: await getTransfers(request) };
});

test.afterEach(async ({ request }) => {
	await setTransfers(request, saved.transfers.map(({ name, amountMinor }) => ({ name, amountMinor })));
	await setPlan(request, saved.profile.budgetMethod, saved.profile);
	await data(await request.put("/api/me/locale", { data: { locale: saved.profile.locale } }));
});

test("pay yourself first: transfers set in setup show everywhere, and the sums add up", async ({ page, request }) => {
	await setPlan(request, null);
	await setTransfers(request, []);
	const income = saved.profile.monthlyIncomeMinor ?? 0;
	expect(income, "Maya needs an income for this test").toBeGreaterThan(0);

	await toPlanStep(page);
	await planCard(page, "Pay yourself first").click();
	await expect(page.getByText("What goes out when salary lands?")).toBeVisible();
	await page.getByRole("textbox", { name: "Transfer 1 name" }).fill("E2E Savings");
	await page.getByRole("textbox", { name: "Transfer 1 amount in MYR" }).fill("500");
	await page.getByRole("button", { name: "Add a transfer" }).click();
	await page.getByRole("textbox", { name: "Transfer 2 name" }).fill("E2E Mum");
	await page.getByRole("textbox", { name: "Transfer 2 amount in MYR" }).fill("300.50");
	await expectNoSidewaysScroll(page, "plan step");

	// The preview uses the real numbers: each transfer, then what's left.
	await expect(visible(page, "Sent out first")).toBeVisible();
	await expect(visible(page, money(80_050))).toBeVisible();
	await expect(visible(page, money(income - 80_050))).toBeVisible();

	await page.getByRole("button", { name: "Show my safe-to-spend" }).click();
	await expect(page.getByText(/800\.50 sent out first in transfers/)).toBeVisible();

	const s = await getSummary(request);
	expect(s.method).toBe("pay_yourself_first");
	expect(s.transfers).toEqual([
		{ name: "E2E Savings", amountMinor: 50_000 },
		{ name: "E2E Mum", amountMinor: 30_050 },
	]);
	expect(s.reservedMinor).toBe(80_050);
	expectSumsUp(s);

	await page.getByRole("button", { name: "Let's go" }).click();
	await expect(page.getByText(/800\.50 for transfers/)).toBeVisible();

	await page.goto("/app/plan");
	const hero = page.locator("section").filter({ has: page.getByRole("heading", { name: "Monthly income" }) });
	await expect(hero.getByRole("link", { name: /Pay yourself first/ })).toBeVisible();
	await expect(hero.getByText("E2E Savings", { exact: true })).toBeVisible();
	await expect(hero.getByText("E2E Mum", { exact: true })).toBeVisible();
	await expect(hero.getByText("To spend", { exact: true })).toBeVisible();
	await expect(hero.getByText("sent out first", { exact: true })).toHaveCount(2);
	await expect(page.getByRole("heading", { name: "Your transfers" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Limits by category" })).toHaveCount(0);
	await expectNoSidewaysScroll(page, "/app/plan");
});

test("Plan page: change, add and remove transfers; incomplete rows are refused", async ({ page, request }) => {
	await setPlan(request, "pay_yourself_first");
	await setTransfers(request, [{ name: "Rent fund", amountMinor: 100_000 }]);
	await page.goto("/app/plan");
	const save = page.getByRole("button", { name: "Save transfers" });
	await expect(page.getByRole("textbox", { name: "Transfer 1 name" })).toHaveValue("Rent fund");
	await expect(save).toBeDisabled();

	// Typed the Malaysian way: a comma groups the thousands.
	await page.getByRole("textbox", { name: "Transfer 1 amount in MYR" }).fill("1,200");
	await save.click();
	await expect(page.getByRole("status").filter({ hasText: "Saved. Safe to spend is updated." })).toBeVisible();
	expect((await getSummary(request)).reservedMinor).toBe(120_000);

	// An amount with no name is refused, and nothing changes.
	await page.getByRole("button", { name: "Add a transfer" }).click();
	await page.getByRole("textbox", { name: "Transfer 2 amount in MYR" }).fill("50");
	await save.click();
	await expect(page.getByText("Name each transfer.")).toBeVisible();
	// A name with a zero amount is refused too.
	await page.getByRole("textbox", { name: "Transfer 2 name" }).fill("Zakat");
	await page.getByRole("textbox", { name: "Transfer 2 amount in MYR" }).fill("0");
	await save.click();
	await expect(page.getByText("Set an amount above zero for Zakat.")).toBeVisible();
	expect((await getSummary(request)).reservedMinor).toBe(120_000);

	await page.getByRole("textbox", { name: "Transfer 2 amount in MYR" }).fill("50");
	await save.click();
	await expect(page.getByRole("status")).toBeVisible();
	let s = await getSummary(request);
	expect(s.transfers.map((x) => x.name)).toEqual(["Rent fund", "Zakat"]);
	expect(s.reservedMinor).toBe(125_000);
	expectSumsUp(s);

	await page.getByRole("button", { name: "Remove transfer 1" }).click();
	await save.click();
	await expect(page.getByRole("status")).toBeVisible();
	s = await getSummary(request);
	expect(s.transfers).toEqual([{ name: "Zakat", amountMinor: 5_000 }]);
	expectSumsUp(s);

	// Removing the last one leaves an empty row and nothing kept aside.
	await page.getByRole("button", { name: "Remove transfer 1" }).click();
	await expect(page.getByRole("textbox", { name: "Transfer 1 name" })).toHaveValue("");
	await save.click();
	await expect(page.getByRole("status")).toBeVisible();
	s = await getSummary(request);
	expect(s.transfers).toEqual([]);
	expect(s.reservedMinor).toBe(0);
	expectSumsUp(s);

	// More out than in is pointed out before saving.
	await page.getByRole("textbox", { name: "Transfer 1 name" }).fill("Too much");
	await page.getByRole("textbox", { name: "Transfer 1 amount in MYR" }).fill("99999999");
	await expect(page.getByText("Your transfers are more than your income.")).toBeVisible();
});

test("income typed as 4,500 is four thousand five hundred, never RM 4.50", async ({ page, request }) => {
	await page.goto("/onboarding?edit=true");
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByLabel("Take-home pay each month").fill("4,500");
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Show my safe-to-spend" }).click();
	await expect(page.getByRole("button", { name: "Let's go" })).toBeVisible();
	const s = await getSummary(request);
	expect(s.incomeMinor).toBe(450_000);
	expectSumsUp(s);
});

test("a plan is optional: skip it, see 'Pick a plan', then pick one and the transfers come back", async ({ page, request }) => {
	await setPlan(request, "pay_yourself_first");
	await setTransfers(request, [{ name: "Savings", amountMinor: 50_000 }]);

	await toPlanStep(page);
	await page.getByRole("button", { name: "Skip for now" }).click();
	await expect(page.getByRole("button", { name: "Let's go" })).toBeVisible();
	let s = await getSummary(request);
	expect(s.method).toBeNull();
	expect(s.transfers).toEqual([]);
	// With no plan, only what dated goals need is kept aside.
	expect(s.reservedMinor).toBe(await goalsMonthly(request));
	expectSumsUp(s);

	await page.goto("/app/plan");
	await expect(page.getByText("You haven't picked a plan yet.")).toBeVisible();
	await expect(page.getByRole("heading", { name: "Your transfers" })).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Limits by category" })).toHaveCount(0);
	await page.goto("/app/me");
	await expect(page.getByText("No plan yet", { exact: true })).toBeVisible();
	await page.goto("/app");
	await expect(page.getByText("Safe to spend today").first()).toBeVisible();

	await page.goto("/app/plan");
	await page.getByRole("link", { name: "Pick a plan" }).click();
	await expect(page).toHaveURL(/\/onboarding/);
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Continue" }).click();
	await planCard(page, "Pay yourself first").click();
	await expect(page.getByRole("textbox", { name: "Transfer 1 name" })).toHaveValue("Savings");
	await page.getByRole("button", { name: "Show my safe-to-spend" }).click();
	await expect(page.getByRole("button", { name: "Let's go" })).toBeVisible();
	s = await getSummary(request);
	expect(s.method).toBe("pay_yourself_first");
	expect(s.reservedMinor).toBe(50_000);
	expectSumsUp(s);
});

test("another plan doesn't count transfers; switching back brings them", async ({ page, request }) => {
	await setPlan(request, "pay_yourself_first");
	await setTransfers(request, [{ name: "ASB", amountMinor: 20_000 }]);

	await toPlanStep(page);
	await planCard(page, "Envelopes").click();
	await expect(page.getByText("What goes out when salary lands?")).toHaveCount(0);
	await page.getByRole("button", { name: "Show my safe-to-spend" }).click();
	await expect(page.getByRole("button", { name: "Let's go" })).toBeVisible();
	let s = await getSummary(request);
	expect(s.method).toBe("envelope");
	expect(s.transfers).toEqual([]);
	expect(s.reservedMinor).toBe(await goalsMonthly(request));
	expectSumsUp(s);
	await page.goto("/app/plan");
	await expect(page.getByRole("heading", { name: "Limits by category" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Your transfers" })).toHaveCount(0);

	await toPlanStep(page);
	await planCard(page, "Pay yourself first").click();
	await expect(page.getByRole("textbox", { name: "Transfer 1 name" })).toHaveValue("ASB");
	await page.getByRole("button", { name: "Show my safe-to-spend" }).click();
	await expect(page.getByRole("button", { name: "Let's go" })).toBeVisible();
	s = await getSummary(request);
	expect(s.reservedMinor).toBe(20_000);
	expectSumsUp(s);
});

test("in Bahasa Melayu the new plan and its words are translated", async ({ page, request }) => {
	await setPlan(request, "pay_yourself_first");
	await setTransfers(request, [{ name: "Mak", amountMinor: 30_000 }]);
	await data(await request.put("/api/me/locale", { data: { locale: "ms" } }));

	await page.goto("/app/plan");
	await expect(page.getByRole("heading", { name: "Pindahan anda" })).toBeVisible();
	await expect(page.getByRole("link", { name: /Bayar diri sendiri dahulu/ })).toBeVisible();
	await expect(page.getByRole("button", { name: "Simpan pindahan" })).toBeVisible();
	await page.goto("/onboarding?edit=true");
	await page.getByRole("button", { name: "Teruskan" }).click();
	await page.getByRole("button", { name: "Teruskan" }).click();
	await expect(page.getByRole("button", { name: "Langkau buat masa ini" })).toBeVisible();
	await expect(page.getByText("Apa yang keluar bila gaji masuk?")).toBeVisible();
});

test.describe("accessibility", () => {
	test.use({ reducedMotion: "reduce" });

	test("axe: Plan with pay yourself first, its setup step, and Plan with no plan", async ({ page, request }) => {
		await setPlan(request, "pay_yourself_first");
		await setTransfers(request, [
			{ name: "Savings", amountMinor: 50_000 },
			{ name: "Mum", amountMinor: 30_000 },
		]);
		await page.goto("/app/plan");
		await expectNoSeriousIssues(page, "/app/plan (pay yourself first)");

		await toPlanStep(page);
		await expectNoSeriousIssues(page, "plan step with transfers");

		await setPlan(request, null);
		await page.goto("/app/plan");
		await expectNoSeriousIssues(page, "/app/plan (no plan)");
	});
});
