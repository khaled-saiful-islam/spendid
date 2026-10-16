import type { Category } from "@spendid/shared";
import { describe, expect, it } from "vitest";
import { applyShorthand, draftMinor, emptyDraft } from "./draft";

const cats: Category[] = [
	{
		id: "11111111-1111-4111-8111-111111111111",
		slug: "food",
		name: "Eating out",
		icon: "UtensilsCrossed",
		tint: "orange",
		kind: "want",
	},
	{
		id: "22222222-2222-4222-8222-222222222222",
		slug: "transport",
		name: "Transport",
		icon: "Car",
		tint: "sky",
		kind: "need",
	},
];

describe("applyShorthand", () => {
	it("fills amount, description and category from shorthand", () => {
		const d = applyShorthand(emptyDraft("MYR"), "lunch 12.50", cats, false);
		expect(d).toMatchObject({
			amountText: "12.50",
			merchant: "Lunch",
			categoryId: cats[0]?.id,
			currency: "MYR",
		});
		expect(draftMinor(d)).toBe(1250);
	});

	it("keeps a category the person chose by hand", () => {
		const start = { ...emptyDraft("MYR"), categoryId: cats[1]?.id ?? "" };
		expect(applyShorthand(start, "lunch 12", cats, true).categoryId).toBe(
			cats[1]?.id,
		);
	});

	it("switches to yesterday and back as the words change", () => {
		const y = applyShorthand(
			emptyDraft("MYR"),
			"grab 9 yesterday",
			cats,
			false,
		);
		expect(y.day).toBe("yesterday");
		expect(applyShorthand(y, "grab 9", cats, false).day).toBe("today");
	});
});

describe("draftMinor", () => {
	it("rejects empty, zero and negative amounts", () => {
		for (const amountText of ["", "0", "-3", "abc"]) {
			expect(draftMinor({ ...emptyDraft("MYR"), amountText })).toBeNull();
		}
	});
});
