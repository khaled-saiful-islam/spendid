import {
	type APIRequestContext,
	expect,
	type Locator,
	type Page,
	test,
} from "@playwright/test";
import { stateFile } from "./support/accounts";
import { expectNoSeriousIssues } from "./support/axe";

/** Pay cycles and the one-sheet plan change. Every test puts Maya's plan back as it was. */
test.use({ storageState: stateFile("maya") });

interface Setup {
	period: "month" | "cycle";
	cycle: { startsOn: string; endsOn: string } | null;
	incomeMinor: number | null;
	method: string | null;
	today: string;
}

const data = async <T>(
	res: Awaited<ReturnType<APIRequestContext["get"]>>,
): Promise<T> => {
	expect(res.ok(), `${res.url()} → ${res.status()}`).toBe(true);
	return ((await res.json()) as { data: T }).data;
};
const getSetup = (r: APIRequestContext) =>
	r.get("/api/plan/setup").then((x) => data<Setup>(x));
const addDays = (day: string, n: number) =>
	new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
		.toISOString()
		.slice(0, 10);

let saved: Setup;

test.beforeEach(async ({ request }) => {
	saved = await getSetup(request);
});

test.afterEach(async ({ request }) => {
	await data(
		await request.put("/api/plan/setup", {
			data: {
				period: "month",
				cycle: null,
				incomeMinor: saved.incomeMinor ?? 0,
				method: saved.method,
			},
		}),
	);
	await data(await request.put("/api/me/locale", { data: { locale: "en" } }));
});

/** The period radios are hidden inside their labels; people tap the label. */
async function pick(sheet: Locator, name: string) {
	await sheet.locator("label").filter({ hasText: name }).click();
	await expect(sheet.getByRole("radio", { name })).toBeChecked();
}

async function openSheet(page: Page) {
	await page.goto("/app/plan");
	await page.getByRole("button", { name: /Change/ }).click();
	await expect(page.getByRole("dialog", { name: "Your plan" })).toBeVisible();
	return page.getByRole("dialog", { name: "Your plan" });
}

test("switch to my own dates: Plan and Home show the cycle and its salary", async ({
	page,
	request,
}) => {
	const { today } = saved;
	const sheet = await openSheet(page);
	await pick(sheet, "My own dates");
	await sheet.getByLabel("Starts", { exact: true }).fill(addDays(today, -2));
	await sheet.getByLabel("Ends", { exact: true }).fill(addDays(today, 28));
	await expect(sheet.getByText("31 days")).toBeVisible();
	await sheet.getByLabel("Salary this cycle", { exact: true }).fill("4,500");
	await expect(
		sheet.getByText(/About RM\s?[\d,.]+ a day to spend\./),
	).toBeVisible();
	await sheet.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Plan saved.")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Salary this cycle" }),
	).toBeVisible();

	expect(await getSetup(request)).toMatchObject({
		period: "cycle",
		cycle: { startsOn: addDays(today, -2), endsOn: addDays(today, 28) },
		incomeMinor: 450_000,
	});
	await page.goto("/app");
	await expect(
		page.getByText(/Left this cycle|Over this cycle/).first(),
	).toBeVisible();
	// Me shows the cycle's salary and dates, not the old monthly income.
	await page.goto("/app/me");
	await expect(page.getByText("Salary this cycle")).toBeVisible();
	await expect(page.getByText("RM 4,500.00")).toBeVisible();
	await expect(page.getByText("Monthly income")).toHaveCount(0);
});

test("empty dates are refused and nothing is saved", async ({
	page,
	request,
}) => {
	const sheet = await openSheet(page);
	await pick(sheet, "My own dates");
	await sheet.getByLabel("Starts", { exact: true }).fill("");
	await sheet.getByLabel("Ends", { exact: true }).fill("");
	await sheet.getByRole("button", { name: "Save" }).click();
	await expect(sheet.getByText("Pick the start and end dates.")).toBeVisible();
	expect((await getSetup(request)).period).toBe(saved.period);
});

test("a too-short cycle shows the rule next to the field", async ({
	page,
	request,
}) => {
	const { today } = saved;
	const sheet = await openSheet(page);
	await pick(sheet, "My own dates");
	await sheet.getByLabel("Starts", { exact: true }).fill(today);
	await sheet.getByLabel("Ends", { exact: true }).fill(addDays(today, 3));
	await sheet.getByRole("button", { name: "Save" }).click();
	await expect(sheet.getByText("A cycle is 7 to 62 days.")).toBeVisible();
	expect((await getSetup(request)).period).toBe(saved.period);
});

test("back to the calendar month", async ({ page, request }) => {
	const { today } = saved;
	await data(
		await request.put("/api/plan/setup", {
			data: {
				period: "cycle",
				cycle: { startsOn: addDays(today, -2), endsOn: addDays(today, 28) },
				incomeMinor: 450_000,
				method: saved.method,
			},
		}),
	);
	const sheet = await openSheet(page);
	await pick(sheet, "Calendar month");
	await sheet.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Plan saved.")).toBeVisible();
	expect((await getSetup(request)).period).toBe("month");
	await expect(
		page.getByRole("heading", { name: "Monthly income" }),
	).toBeVisible();
});

test("the next-cycle card: Change opens the sheet, Looks right confirms", async ({
	page,
}) => {
	// A drafted cycle needs the server's clock to pass a cycle's end, so the summary is mocked
	// here; drafting itself is covered by the API tests.
	const { today } = saved;
	await page.route("**/api/summary", async (route) => {
		const res = await route.fetch();
		const body = await res.json();
		body.data.period = {
			kind: "cycle",
			start: today,
			end: addDays(today, 30),
			days: 31,
			cycleId: "0192f000-0000-7000-8000-000000000000",
			status: "draft",
		};
		await route.fulfill({ response: res, json: body });
	});
	let confirmed = false;
	await page.route("**/api/plan/cycle/confirm", async (route) => {
		confirmed = true;
		await route.fulfill({ json: { success: true, data: saved } });
	});
	await page.goto("/app");
	const card = page.getByRole("region", { name: /Your cycle ended on/ });
	await expect(card).toBeVisible();
	await card.getByRole("button", { name: "Change" }).click();
	await expect(page.getByRole("dialog", { name: "Your plan" })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog", { name: "Your plan" })).toHaveCount(0);
	await card.getByRole("button", { name: "Looks right" }).click();
	await expect(page.getByText("Your new cycle is set.")).toBeVisible();
	expect(confirmed).toBe(true);
});

test("the sheet fits a small phone and passes accessibility checks", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 740 });
	const sheet = await openSheet(page);
	await pick(sheet, "My own dates");
	await expect(sheet.getByLabel("Starts", { exact: true })).toBeVisible();
	const wide = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth + 1,
	);
	expect(wide, "the sheet scrolls sideways at 360px").toBe(false);
	await expectNoSeriousIssues(page, "plan sheet at 360px");
});

test("the sheet's close button stays in reach after scrolling to the bottom", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 640 });
	const sheet = await openSheet(page);
	await pick(sheet, "My own dates");
	await sheet.getByRole("button", { name: "Save" }).scrollIntoViewIfNeeded();
	const close = sheet.getByRole("button", { name: "Close" });
	await expect(close).toBeInViewport({ ratio: 1 });
	await close.click();
	await expect(sheet).toHaveCount(0);
	expect((await getSetup(page.request)).period).toBe(saved.period);
});

test("Me → Change: Cancel goes back without saving", async ({
	page,
	request,
}) => {
	await page.goto("/app/me");
	await page
		.getByRole("region", { name: "Money settings" })
		.getByRole("link", { name: "Change" })
		.click();
	await expect(page).toHaveURL(/\/onboarding/);
	await page.getByLabel("What should we call you?").fill("Someone else");
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(page).toHaveURL(/\/app\/me$/);
	await expect(page.getByText("Someone else")).toHaveCount(0);
	expect(await getSetup(request)).toEqual(saved);
});

test("in Bahasa Melayu the sheet is translated", async ({ page, request }) => {
	await data(await request.put("/api/me/locale", { data: { locale: "ms" } }));
	await page.goto("/app/plan");
	// The plan button ends with "Tukar" (Change); the theme switch only starts with it.
	await page.getByRole("button", { name: /Tukar$/ }).click();
	const sheet = page.getByRole("dialog", { name: "Rancangan anda" });
	await expect(sheet).toBeVisible();
	await pick(sheet, "Tarikh saya sendiri");
	await expect(
		sheet.getByLabel("Gaji kitaran ini", { exact: true }),
	).toBeVisible();
});
