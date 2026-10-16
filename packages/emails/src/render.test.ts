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

	it("renders a notice with its facts and an unsubscribe link", async () => {
		const job = EmailJobSchema.parse({
			type: "notice",
			kind: "weekly-summary",
			to: "maya@example.com",
			name: "Maya",
			subject: "Your week: RM 412.00",
			preview: "A calm week.",
			heading: "Your week in money",
			body: "You spent a little less than last week.",
			rows: [{ label: "Spent this week", value: "RM 412.00" }],
			action: "Open Spendid",
			url: "http://localhost:8600/app",
			unsubscribeUrl: "http://localhost:8600/unsubscribe?t=x",
		});
		const email = await renderEmail(job);
		expect(email.subject).toBe("Your week: RM 412.00");
		expect(email.html).toContain("Spent this week");
		expect(email.html).toContain("RM 412.00");
		expect(email.html).toContain("http://localhost:8600/unsubscribe?t=x");
		expect(email.text).toContain("Turn them off");
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
