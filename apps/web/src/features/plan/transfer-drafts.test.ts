import { describe, expect, it } from "vitest";
import {
	draftsTotal,
	readDrafts,
	type TransferDraft,
	toDrafts,
	transferFill,
} from "./transfer-drafts";

const row = (name: string, amount: string, key = name): TransferDraft => ({
	key,
	name,
	amount,
});

describe("readDrafts", () => {
	it("keeps complete rows in order, in minor units", () => {
		expect(
			readDrafts([row("Savings", "500"), row("Mum", "300.50")], "MYR"),
		).toEqual({
			list: [
				{ name: "Savings", amountMinor: 50_000 },
				{ name: "Mum", amountMinor: 30_050 },
			],
		});
	});

	it("reads 1,200 as one thousand two hundred", () => {
		expect(readDrafts([row("ASB", "1,200")], "MYR")).toEqual({
			list: [{ name: "ASB", amountMinor: 120_000 }],
		});
	});

	it("ignores fully empty rows and trims names", () => {
		expect(readDrafts([row("", ""), row("  Zakat ", "50")], "MYR")).toEqual({
			list: [{ name: "Zakat", amountMinor: 5_000 }],
		});
	});

	it("refuses a row with only an amount, or a zero or unreadable amount", () => {
		expect(readDrafts([row("", "50")], "MYR")).toHaveProperty("error");
		expect(readDrafts([row("Mum", "")], "MYR")).toHaveProperty("error");
		expect(readDrafts([row("Mum", "0")], "MYR")).toHaveProperty("error");
		expect(readDrafts([row("Mum", "1,2345")], "MYR")).toHaveProperty("error");
	});
});

describe("draftsTotal", () => {
	it("adds only rows with a valid amount, while typing", () => {
		expect(
			draftsTotal(
				[row("A", "500"), row("B", ""), row("C", "1,000.25"), row("D", "1..")],
				"MYR",
			),
		).toBe(150_025);
	});
});

describe("toDrafts", () => {
	it("shows saved amounts the way they were typed", () => {
		expect(
			toDrafts([{ id: "x", name: "Mum", amountMinor: 30_050 }], "MYR"),
		).toEqual([{ key: "x", name: "Mum", amount: "300.5" }]);
	});
});

describe("transferFill", () => {
	it("gives each transfer a colour, repeating after five", () => {
		expect(transferFill(0)).toBe("bg-marigold");
		expect(transferFill(5)).toBe("bg-marigold");
		expect(transferFill(1)).not.toBe(transferFill(0));
	});
});
