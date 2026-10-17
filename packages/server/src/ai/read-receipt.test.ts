import { describe, expect, it } from "vitest";
import { toDraft } from "./read-receipt";

const read = {
	merchant: "JAYA GROCER",
	date: "2026-10-16",
	currency: "MYR",
	total: 130.7,
	tax: 5.34,
	category: "groceries",
	items: [
		{
			name: "MILK FRESH 1L x2",
			quantity: 1,
			lineTotal: 13.8,
			warrantyMonths: null,
		},
		{
			name: "XIAOMI POWER BANK 20K",
			quantity: null,
			lineTotal: 89,
			warrantyMonths: 12,
		},
	],
};

describe("toDraft", () => {
	it("converts the reading to minor units with tidy names", () => {
		const d = toDraft(read, "MYR");
		expect(d).toMatchObject({
			merchant: "Jaya Grocer",
			date: "2026-10-16",
			currency: "MYR",
			totalMinor: 13070,
			taxMinor: 534,
		});
	});

	it("recovers quantities printed in the name and works out unit prices", () => {
		const [milk, bank] = toDraft(read, "MYR").items;
		expect(milk).toMatchObject({
			name: "Milk Fresh 1L",
			quantity: 2,
			unitPriceMinor: 690,
			totalMinor: 1380,
		});
		expect(bank).toMatchObject({
			quantity: 1,
			unitPriceMinor: 8900,
			warrantyMonths: 12,
		});
	});

	it("falls back to the home currency and drops malformed dates", () => {
		const d = toDraft({ ...read, currency: "??", date: "16/10/2026" }, "SGD");
		expect(d.currency).toBe("SGD");
		expect(d.date).toBeNull();
	});
});
