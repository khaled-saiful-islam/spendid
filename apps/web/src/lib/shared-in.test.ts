import { describe, expect, it } from "vitest";
import { cleanPaymentText } from "./shared-in";

describe("cleanPaymentText", () => {
	it("keeps the shop and amount from a payment message", () => {
		expect(
			cleanPaymentText("Payment to Village Park Restaurant RM23.90 successful"),
		).toBe("Village Park Restaurant RM23.90");
		expect(cleanPaymentText("You paid RM 8.90 to Tealive")).toBe(
			"RM 8.90 to Tealive",
		);
		expect(cleanPaymentText("Pembayaran kepada ZUS Coffee RM12 berjaya")).toBe(
			"ZUS Coffee RM12",
		);
	});
});
