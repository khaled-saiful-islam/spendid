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

test("home shows today's safe-to-spend", async ({ page }) => {
	await page.goto("/app");
	// The card has three states, depending on how today and the month are going.
	await expect(
		page
			.getByText(/^(Safe to spend today|Over today's amount by|This month is over budget by)$/)
			.first(),
	).toBeVisible();
	await expect(page.getByRole("img", { name: /pangolin/i })).toHaveCount(0);
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

test("hide amounts blurs every number until shown again", async ({ page, isMobile }) => {
	await page.goto("/app");
	const html = page.locator("html");
	if (isMobile) {
		await page.getByRole("button", { name: "Hide amounts" }).click();
		await expect(html).toHaveAttribute("data-hide-money", /.*/);
		await page.getByRole("button", { name: "Show amounts" }).click();
	} else {
		// On desktop it lives in the account menu, as a labelled switch.
		await page.getByRole("button", { name: /Profile & settings/ }).click();
		const toggle = page.getByRole("switch", { name: "Hide amounts" });
		await toggle.click();
		await expect(html).toHaveAttribute("data-hide-money", /.*/);
		await toggle.click();
	}
	await expect(html).not.toHaveAttribute("data-hide-money", /.*/);
});

test("Ask Spendid opens with real numbers, playful modes and the question box", async ({ page }) => {
	await page.goto("/app/ask");
	const fresh = page.getByRole("button", { name: /New chat/ });
	if (await fresh.count()) await fresh.first().click();
	await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
	await expect(
		page
			.getByRole("region", { name: "Questions about your month" })
			.getByRole("button", { name: /Where did my RM [\d,.]+ go\?/ }),
	).toBeVisible();
	await expect(page.getByRole("figure", { name: /type expenses like a text message/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /^Roast my month/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /^Hype me up\s*Your real wins/ })).toBeVisible();
});

test("Family shows the circle and what each side shares", async ({ page }) => {
	await page.goto("/app/family");
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	const map = page.getByRole("region", { name: "Who sees what" });
	await expect(map.getByRole("link", { name: /Adam/ })).toBeVisible();
	await expect(map.getByText(/^(sees your|sees nothing of yours|your sharing is paused)/)).toBeVisible();
	await expect(map.getByText(/^(you see their|you see nothing|their sharing is paused)/)).toBeVisible();
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

test("subscriptions: add one, see it coming up, then remove it", async ({ page }) => {
	const name = "Playwright Prime";
	await page.goto("/app/subscriptions");
	await page.getByRole("main").getByRole("button", { name: /^Add( your first)?$/ }).first().click();
	const sheet = page.getByRole("dialog", { name: "Add a subscription" });
	await sheet.getByRole("button", { name: /Something else/ }).click();
	await sheet.getByLabel("Name").fill(name);
	await sheet.getByRole("textbox", { name: "Amount" }).fill("19.90");
	const inAWeek = new Date(Date.now() + 7 * 86_400_000);
	await sheet.getByLabel("Next payment").fill(inAWeek.toISOString().slice(0, 10));
	await sheet.getByRole("button", { name: "Add subscription" }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole("region", { name: "Coming up" }).getByText(name)).toBeVisible();

	const res = await page.request.get("/api/subscriptions");
	const sub = ((await res.json()).data.active as { id: string; name: string }[]).find((s) => s.name === name);
	expect(sub).toBeTruthy();
	await page.request.delete(`/api/subscriptions/${sub?.id}`, { headers: { "content-type": "application/json" }, data: {} });
});

test("challenges: start one, see its days, then stop it", async ({ page }) => {
	// At most two run at once: stop any left over so this one can start.
	const board = await (await page.request.get("/api/challenges")).json();
	for (const c of board.data.active as { id: string }[])
		await page.request.post(`/api/challenges/${c.id}/give-up`, { data: {} });
	await page.goto("/app/plan");
	const section = page.getByRole("region", { name: "Challenges" });
	// With none running, the picks start one in a single tap.
	await section.getByRole("button", { name: /Shopping pause/ }).click();
	const card = section.getByRole("article").filter({ hasText: "Shopping pause" });
	await expect(card.getByRole("list", { name: "Days" }).getByRole("listitem")).toHaveCount(7);
	await card.getByRole("button", { name: "Stop this challenge" }).click();
	await expect(card).toBeHidden();
});

test("month pace shows where the month is heading and a what-if", async ({ page }) => {
	await page.goto("/app");
	const card = page.getByRole("region", { name: "Where your month is heading" });
	await expect(card.getByText(/At this pace/)).toBeVisible();
	await expect(card.getByText(/^(On track|Above pace|Runs out early)$/)).toBeVisible();
	await card.getByRole("button", { name: "What if I spent less each day?" }).click();
	await card.getByRole("slider").fill("20");
	await expect(card.getByText(/You'd (finish|be)/)).toBeVisible();
});

test("insights: tap a day for its expenses, tap a category for its list", async ({ page }) => {
	await page.goto("/app/activity?view=insights");
	const flow = page.getByRole("region", { name: "Where your money flowed" });
	await expect(flow.getByRole("img")).toBeVisible();
	const days = page.getByRole("button", { name: /expenses$/ });
	await days.first().click();
	const sheet = page.getByRole("dialog");
	await expect(sheet.getByRole("listitem").first()).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(sheet).toBeHidden();
	await flow.getByRole("link", { name: /See these expenses$/ }).first().click();
	await expect(page).toHaveURL(/\/app\/activity\?category=/);
	await expect(page.getByRole("combobox").first()).not.toHaveValue("");
});

test("Money Wrapped downloads its card as a PDF", async ({ page }) => {
	await page.goto("/app/wrapped");
	const next = page.getByRole("button", { name: "Next" });
	const download = page.getByRole("button", { name: "Download PDF" });
	for (let i = 0; i < 15 && !(await download.isVisible()); i++) await next.click();
	const saved = page.waitForEvent("download");
	await download.click();
	const file = await saved;
	expect(file.suggestedFilename()).toMatch(/^spendid-\d{4}-\d{2}\.pdf$/);
	const path = await file.path();
	const { readFile } = await import("node:fs/promises");
	expect((await readFile(path)).subarray(0, 5).toString()).toBe("%PDF-");
});

test("Get the app: one-tap install when the browser offers it, and a QR code to share", async ({ page }) => {
	await page.goto("/app/me");
	// Pretend the browser offered to install (Chrome fires this once, on its own schedule).
	await page.evaluate(() => {
		const offer = Object.assign(new Event("beforeinstallprompt"), {
			prompt: async () => undefined,
			userChoice: Promise.resolve({ outcome: "accepted" }),
		});
		window.dispatchEvent(offer);
	});
	await page.getByRole("button", { name: "Get the app" }).click();
	const sheet = page.getByRole("dialog", { name: "Get the Spendid app" });
	await expect(sheet.getByRole("img", { name: /^QR code that opens/ })).toBeVisible();
	await expect(sheet.getByRole("button", { name: "Copy link" })).toBeVisible();
	await sheet.getByRole("button", { name: "Install Spendid" }).click();
	await expect(page.getByText("Spendid is installed. Find it with your apps.")).toBeVisible();
});

test("the animated splash plays on app start, then hands over; a browser tab skips it", async ({ page }) => {
	await page.goto("/app?splash");
	await expect(page.locator("#splash .coin")).toBeVisible();
	await expect(page.locator("#splash")).toHaveCount(0, { timeout: 4000 });
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	await page.goto("/app");
	await expect(page.locator("#splash")).toBeHidden();
});

test("Activity shows 15 expenses at a time, and more only on Show more", async ({ page }) => {
	await page.goto("/app/activity");
	const rows = page.getByRole("main").getByRole("listitem");
	await expect(page.getByText(/^Showing 15 of \d+$/)).toBeVisible();
	await expect(rows).toHaveCount(15);
	await page.mouse.wheel(0, 20000);
	await expect(rows).toHaveCount(15);
	await page.getByRole("button", { name: /^Show \d+ more$/ }).click();
	await expect.poll(() => rows.count()).toBeGreaterThan(15);
});

test("tapping a question on Ask fills the box to edit; nothing is asked until send", async ({ page }) => {
	await page.goto("/app/ask");
	const fresh = page.getByRole("button", { name: /New chat/ });
	if (await fresh.count()) await fresh.first().click();
	const tile = page
		.getByRole("region", { name: "Questions about your month" })
		.getByRole("button", { name: /^Where did my RM [\d,.]+ go\?/ });
	const question = (await tile.innerText()).split("\n")[0]?.trim() ?? "";
	await tile.click();
	const box = page.getByRole("textbox", { name: "Your question" });
	await expect(box).toHaveValue(question);
	await expect(box).toBeFocused();
	await expect(page.getByText("Change the question if you like, then press send.")).toBeVisible();
	// Still the start screen: no question was sent.
	await expect(page.getByRole("figure", { name: /type expenses like a text message/ })).toBeVisible();
});

test("phones get a home-screen card until it's installed or put off", async ({ page, isMobile }) => {
	test.skip(!isMobile, "The card is for phones");
	await page.addInitScript(() => localStorage.removeItem("spendid-install-nudge"));
	await page.goto("/app");
	const card = page.getByRole("region", { name: "Put Spendid on your home screen" });
	await expect(card).toBeVisible();
	await card.getByRole("button", { name: "Show me how" }).click();
	const sheet = page.getByRole("dialog", { name: "Get the Spendid app" });
	await expect(sheet).toBeVisible();
	await sheet.getByRole("button", { name: "Close" }).last().click();
	await expect(sheet).toBeHidden();
	await card.getByRole("button", { name: "Not now" }).click();
	await expect(card).toBeHidden();
	await page.reload();
	await expect(page.getByRole("region", { name: "Put Spendid on your home screen" })).toBeHidden();
});

test("inside another app's browser, the install steps say how to get out first", async ({ browser }) => {
	const ctx = await browser.newContext({
		userAgent:
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0",
		viewport: { width: 390, height: 844 },
	});
	const page = await ctx.newPage();
	await page.goto("/");
	await page.getByRole("button", { name: "Get the app, it's free" }).click();
	const sheet = page.getByRole("dialog", { name: "Get the Spendid app" });
	await expect(sheet.getByText("You're in Instagram's browser, which can't install apps.")).toBeVisible();
	await expect(sheet.getByText(/Open in Safari/).first()).toBeVisible();
	await ctx.close();
});

test("phone notifications: turn on, send a test, turn off", async ({ page }) => {
	// Test browsers have no push service, so this stands in for the browser's side only;
	// the server side (saving the device, sending the test) is real.
	const endpoint = `https://push.example.test/e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	await page.addInitScript((url) => {
		let sub: unknown = null;
		const device = {
			endpoint: url,
			toJSON: () => ({ endpoint: url, keys: { p256dh: "e2e-p256dh", auth: "e2e-auth" } }),
			unsubscribe: async () => {
				sub = null;
				return true;
			},
		};
		Object.defineProperty(Notification, "permission", { get: () => (sub ? "granted" : "default") });
		Notification.requestPermission = async () => "granted";
		PushManager.prototype.getSubscription = async () => sub as PushSubscription | null;
		PushManager.prototype.subscribe = async () => {
			sub = device;
			return device as unknown as PushSubscription;
		};
	}, endpoint);
	await page.goto("/app/me");
	const card = page.getByRole("region", { name: "Notifications on this phone" });
	await card.getByRole("button", { name: "Turn on" }).click();
	await expect(page.getByText("Notifications are on for this phone.")).toBeVisible();
	await expect(card.getByText(/^On\. Bills due/)).toBeVisible();
	// The stand-in device can't really be reached, and the app says so plainly.
	await card.getByRole("button", { name: "Send a test" }).click();
	await expect(page.getByText("Couldn't reach this phone. Turn notifications off and on again.")).toBeVisible();
	await card.getByRole("button", { name: "Turn off" }).click();
	await expect(card.getByRole("button", { name: "Turn on" })).toBeVisible();
});

test("on an iPhone in Safari, notifications ask to install Spendid first", async ({ browser }) => {
	const ctx = await browser.newContext({
		storageState: stateFile("maya"),
		userAgent:
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
		viewport: { width: 390, height: 844 },
	});
	const page = await ctx.newPage();
	await page.goto("/app/me");
	const card = page.getByRole("region", { name: "Notifications on this phone" });
	await expect(card.getByText(/only allow notifications once Spendid is on your Home Screen/)).toBeVisible();
	await card.getByRole("button", { name: "Install Spendid first" }).click();
	await expect(page.getByRole("dialog", { name: "Get the Spendid app" })).toBeVisible();
	await ctx.close();
});

test("a deleted chat stays deleted after a reload", async ({ page, isMobile }) => {
	const id = crypto.randomUUID();
	await page.request.put(`/api/ask/threads/${id}`, {
		data: {
			messages: [
				{ id: "u1", role: "user", text: "Playwright chat to delete", steps: [], charts: [], drafts: null, status: "done" },
				{ id: "a1", role: "assistant", text: "ok", steps: [], charts: [], drafts: null, status: "done" },
			],
		},
	});
	await page.goto("/app/ask");
	if (isMobile) await page.getByRole("button", { name: /^Chats/ }).click();
	const row = page.getByRole("listitem").filter({ hasText: "Playwright chat to delete" }).first();
	await row.hover();
	await row.getByRole("button", { name: /Delete chat/ }).click();
	await expect(page.getByText("Chat deleted.")).toBeVisible();
	await page.reload();
	const list = await (await page.request.get("/api/ask/threads")).json();
	expect((list.data as { title: string }[]).map((t) => t.title)).not.toContain("Playwright chat to delete");
});

test("a card from Ask fixes an expense, and Undo puts it back", async ({ page, isMobile }) => {
	const shop = "Playwright Ask shop";
	await removeLeftovers(page.request, shop);
	const cats = (await (await page.request.get("/api/categories")).json()).data as { id: string; slug: string }[];
	const transport = cats.find((c) => c.slug === "transport");
	const created = await page.request.post("/api/transactions", {
		data: { amountMinor: 1800, currency: "MYR", categoryId: transport?.id, merchant: shop },
	});
	expect(created.ok()).toBe(true);
	const tx = (await created.json()).data as { id: string; occurredAt: string };
	const day = tx.occurredAt.slice(0, 10);
	const look = { merchant: shop, amountMinor: 1800, categoryName: "Transport", day };
	const id = crypto.randomUUID();
	await page.request.put(`/api/ask/threads/${id}`, {
		data: {
			messages: [
				{ id: "u1", role: "user", text: "Playwright: my grab was 15", steps: [], charts: [], drafts: null, status: "done" },
				{
					id: "a1",
					role: "assistant",
					text: "Here's the fix, ready to confirm.",
					steps: [],
					charts: [],
					drafts: null,
					status: "done",
					actions: [
						{
							status: "ready",
							action: {
								kind: "expense-edit",
								transactionId: tx.id,
								currency: "MYR",
								before: look,
								after: { ...look, amountMinor: 1500 },
								patch: { amountMinor: 1500 },
								undo: { amountMinor: 1800 },
							},
						},
					],
				},
			],
		},
	});
	const amount = async () => {
		const res = await page.request.get("/api/transactions", { params: { q: shop, limit: 5 } });
		const items = (await res.json()).data.items as { id: string; amountMinor: number }[];
		return items.find((i) => i.id === tx.id)?.amountMinor;
	};

	await page.goto("/app/ask");
	if (isMobile) await page.getByRole("button", { name: /^Chats/ }).click();
	await page.getByRole("listitem").filter({ hasText: "Playwright: my grab was 15" }).first().click();
	const card = page.getByRole("region", { name: "Fix an expense" });
	await expect(card.getByText("RM 15.00")).toBeVisible();
	await card.getByRole("button", { name: "Save change" }).click();
	await expect(card.getByText("Expense updated.")).toBeVisible();
	await expect.poll(amount).toBe(1500);
	await card.getByRole("button", { name: "Undo" }).click();
	await expect(card.getByText("Undone. It's back as it was.")).toBeVisible();
	await expect.poll(amount).toBe(1800);

	await page.request.delete(`/api/transactions/${tx.id}`, { headers: { "content-type": "application/json" }, data: {} });
	await page.request.delete(`/api/ask/threads/${id}`);
});

test.describe("on a device set to another time zone", () => {
	test.use({ timezoneId: "UTC" });

	test("times show in the app's time zone (Kuala Lumpur), not the device's", async ({ page }) => {
		const shop = "Playwright time zone shop";
		await removeLeftovers(page.request, shop);
		const cats = (await (await page.request.get("/api/categories")).json()).data as { id: string; slug: string }[];
		// 06:30 UTC is 2:30 pm in Kuala Lumpur.
		const at = new Date();
		at.setUTCHours(6, 30, 0, 0);
		if (at.getTime() > Date.now()) at.setUTCDate(at.getUTCDate() - 1);
		const created = await page.request.post("/api/transactions", {
			data: {
				amountMinor: 100,
				currency: "MYR",
				categoryId: cats.find((c) => c.slug === "groceries")?.id,
				merchant: shop,
				occurredAt: at.toISOString(),
			},
		});
		const tx = (await created.json()).data as { id: string };
		await page.goto("/app/activity");
		const row = page.getByRole("button", { name: new RegExp(shop) }).first();
		await expect(row).toContainText(/2:30\s?PM/i);
		await page.request.delete(`/api/transactions/${tx.id}`, { headers: { "content-type": "application/json" }, data: {} });
	});
});

