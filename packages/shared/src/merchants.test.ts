import { describe, expect, it } from "vitest";
import {
	cleanMerchant,
	looksLikeSameShop,
	merchantKey,
	sameMerchant,
} from "./merchants";

describe("cleanMerchant", () => {
	it.each([
		["TEALIVE @ KLCC SDN BHD", "Tealive"],
		["SQ *BLUE BOTTLE COFFEE", "Blue Bottle Coffee"],
		["MCDONALD'S 0423", "Mcdonald's"],
		["Jaya Grocer (M) Sdn. Bhd.", "Jaya Grocer"],
		["Starbucks - Mid Valley", "Starbucks"],
		["7-Eleven", "7-Eleven"],
		["Marks & Spencer", "Marks & Spencer"],
		["  village   park nasi lemak ", "Village Park Nasi Lemak"],
		["GRAB #1234", "Grab"],
		["iPhone case shop", "iPhone case shop"],
		["Coffee at Home", "Coffee at Home"],
	])("%s → %s", (raw, clean) => {
		expect(cleanMerchant(raw)).toBe(clean);
	});

	it("never returns an empty name", () => {
		expect(cleanMerchant("#1234")).toBe("#1234");
	});
});

describe("merchantKey", () => {
	it("treats variants of one shop the same", () => {
		expect(merchantKey("TEALIVE @ KLCC")).toBe(merchantKey("Tealive"));
		expect(merchantKey("Jaya Grocer Sdn Bhd")).toBe("jaya grocer");
	});
});

describe("sameMerchant", () => {
	it("matches a name and a longer version of it, not look-alikes", () => {
		expect(sameMerchant("unifi", "unifi internet")).toBe(true);
		expect(sameMerchant("netflix", "netflix")).toBe(true);
		expect(sameMerchant("celcom postpaid", "celcomdigi")).toBe(false);
		expect(sameMerchant("grab", "grabfood")).toBe(false);
		expect(sameMerchant("", "grab")).toBe(false);
	});
});

describe("looksLikeSameShop", () => {
	it.each([
		["tealive klcc", "tealive"],
		["unifi", "unifi internet"],
		["grab food", "grabfood"],
		["7 eleven", "7eleven"],
		["starbuck", "starbucks"],
		["kedai kopi ah seng", "ah seng"],
	])("%s and %s are the same shop written two ways", (a, b) => {
		expect(looksLikeSameShop(a, b)).toBe(true);
	});

	it.each([
		["lunch in office", "for breakfast in office"],
		["sushi lunch", "thai lunch"],
		["kopi", "teh"],
		["jaya grocer", "village grocer"],
		["lunch", "dinner"],
		["grab", "grabfood"],
	])("%s and %s are different things", (a, b) => {
		expect(looksLikeSameShop(a, b)).toBe(false);
	});
});
