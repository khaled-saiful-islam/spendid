import { describe, expect, it } from "vitest";
import { guessCategorySlug, SYSTEM_CATEGORIES } from "./categories";

describe("system categories", () => {
	it("cover everyday life: every slug is unique and only Other has no keywords", () => {
		const slugs = SYSTEM_CATEGORIES.map((c) => c.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		expect(slugs.length).toBeGreaterThanOrEqual(25);
		for (const c of SYSTEM_CATEGORIES)
			if (c.slug !== "other") expect(c.keywords.length).toBeGreaterThan(3);
	});

	it("files common Malaysian spending in the right place", () => {
		const cases: [string, string][] = [
			["teh tarik", "food"],
			["petrol 80", "car"],
			["parking", "car"],
			["grab to office", "transport"],
			["unifi bill", "phone"],
			["maxis postpaid", "phone"],
			["tnb electricity", "bills"],
			["prudential premium", "insurance"],
			["ptptn", "loans"],
			["car loan", "loans"],
			["zakat", "charity"],
			["vet for the cat", "pets"],
			["new laptop", "gadgets"],
			["gym membership", "fitness"],
			["asb top up", "savings"],
			["saman jpj", "taxes"],
			["mr diy", "household"],
			["birthday gift", "gifts"],
		];
		for (const [text, slug] of cases)
			expect([text, guessCategorySlug(text)]).toEqual([text, slug]);
	});

	it("files food ordered online as Food delivery, and eating out stays Eating out", () => {
		const cases: [string, string][] = [
			["grabfood nasi lemak", "food-delivery"],
			["grab food dinner", "food-delivery"],
			["foodpanda", "food-delivery"],
			["shopee food", "food-delivery"],
			["food delivery", "food-delivery"],
			["food online order", "food-delivery"],
			["online food order", "food-delivery"],
			["lunch", "food"],
			["mamak dinner", "food"],
			["grab to office", "transport"],
		];
		for (const [text, slug] of cases)
			expect([text, guessCategorySlug(text)]).toEqual([text, slug]);
	});

	it("finds nothing for words it doesn't know, so the app can fall back to Other", () => {
		expect(guessCategorySlug("xyz thing")).toBeNull();
	});
});
