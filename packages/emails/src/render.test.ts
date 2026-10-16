import { describe, expect, it } from "vitest";
import { EmailJobSchema, renderEmail } from "./index";

describe("renderEmail", () => {
	it("renders the verify email with the link in HTML and plain text", async () => {
		const job = EmailJobSchema.parse({
			type: "verify-email",
			to: "maya@example.com",
			name: "Maya",
			url: "http://localhost:8600/verify?token=abc",
		});
		const email = await renderEmail(job);

		expect(email.subject).toBe("Confirm your email for Spendid");
		expect(email.html).toContain("Welcome, Maya");
		expect(email.html).toContain("http://localhost:8600/verify?token=abc");
		expect(email.text).toContain("Confirm email");
	});

	it("rejects a job without a valid link", () => {
		const result = EmailJobSchema.safeParse({
			type: "reset-password",
			to: "maya@example.com",
			name: "Maya",
			url: "not a url",
		});
		expect(result.success).toBe(false);
	});
});
