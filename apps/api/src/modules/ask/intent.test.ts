import { describe, expect, it } from "vitest";
import { questionLanguage, tellsAPurchase } from "./intent";

describe("tellsAPurchase", () => {
	it("hears spending told as a fact, in English and Malay", () => {
		for (const said of [
			"Yesterday, I spend RM49 for groceries",
			"I spent 12 on lunch",
			"paid RM30 for parking yesterday",
			"Semalam, saya belanja RM20 untuk barang dapur.",
			"beli kopi 6 ringgit",
			"I spent twelve ringgit on lunch",
		])
			expect(tellsAPurchase(said), said).toBe(true);
	});

	it("leaves questions and talk without an amount alone", () => {
		for (const said of [
			"Did I spend RM49 on groceries yesterday?",
			"How much did I spend yesterday",
			"Berapa saya belanja semalam?",
			"What did I buy last week",
			"I spent too much this month",
			"lunch 12",
		])
			expect(tellsAPurchase(said), said).toBe(false);
	});
});

describe("questionLanguage", () => {
	it("follows the words used, else the app's language", () => {
		expect(
			questionLanguage("Semalam, saya belanja RM20 untuk barang dapur.", "en"),
		).toBe("ms");
		expect(
			questionLanguage("Yesterday, I spend RM49 for groceries", "ms"),
		).toBe("en");
		expect(questionLanguage("Grab 15", "ms")).toBe("ms");
		expect(questionLanguage("Grab 15", "en")).toBe("en");
	});
});
