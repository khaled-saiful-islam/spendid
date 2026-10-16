import { describe, expect, it } from "vitest";
import { cleanMerchant, merchantKey } from "./merchants";

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
