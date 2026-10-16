import { render } from "@react-email/render";
import { createElement } from "react";
import type { EmailJob } from "./jobs";
import { ActionEmail, type ActionEmailProps } from "./templates/ActionEmail";

export * from "./jobs";

export interface RenderedEmail {
	subject: string;
	html: string;
	text: string;
}

function content(job: EmailJob): { subject: string; props: ActionEmailProps } {
	switch (job.type) {
		case "verify-email":
			return {
				subject: "Confirm your email for Spendid",
				props: {
					preview: "One tap to confirm your email.",
					heading: `Welcome, ${job.name}`,
					body: "Confirm your email so we can keep your account safe and send you the things you ask for, like bill reminders and your monthly recap.",
					action: "Confirm email",
					url: job.url,
					footnote: "This link works for 24 hours.",
				},
			};
		case "account-paused":
			return {
				subject: "Your Spendid account is paused",
				props: {
					preview: "Your account has been paused.",
					heading: "Your account is paused",
					body: `Hi ${job.name}, the Spendid team has paused your account${job.reason ? ` because: ${job.reason}` : ""}. Your data is safe and nothing has been deleted. Reply to this email if you think this is a mistake.`,
					action: "Contact support",
					url: "mailto:support@spendid.app",
					footnote: "Paused accounts can't sign in until they're restored.",
				},
			};
		case "account-restored":
			return {
				subject: "Your Spendid account is back",
				props: {
					preview: "You can sign in again.",
					heading: "Welcome back",
					body: `Hi ${job.name}, your account is active again. Everything is just as you left it.`,
					action: "Open Spendid",
					url: job.url,
					footnote: "Thanks for your patience.",
				},
			};
		case "family-invite":
			return {
				subject: `${job.inviterName} invited you to their Spendid family circle`,
				props: {
					preview: `${job.inviterName} wants to plan money together.`,
					heading: "You're invited",
					body: `Hi ${job.name}, ${job.inviterName} added you as their ${job.relation.toLowerCase()} and invited you to their family circle on Spendid. You choose what you share with them, and you can pause or stop at any time.`,
					action: "See the invite",
					url: job.url,
					footnote: "This invite works once and ends after 7 days. If you don't know them, you can ignore this email.",
				},
			};
		case "family-joined":
			return {
				subject: `${job.joinerName} joined your family circle`,
				props: {
					preview: `${job.joinerName} accepted your invite.`,
					heading: `${job.joinerName} is in your circle`,
					body: `Hi ${job.name}, ${job.joinerName} accepted your invite. You can see what each of you shares on the Family page.`,
					action: "Open Family",
					url: job.url,
					footnote: "You can change or pause what you share at any time.",
				},
			};
		case "family-share-changed":
			return {
				subject: "Your family circle changed",
				props: {
					preview: job.change,
					heading: "Something changed in your circle",
					body: `Hi ${job.name}, ${job.change}`,
					action: "Open Family",
					url: job.url,
					footnote: "Everyone in a circle always sees what they share and can change it.",
				},
			};
		case "reset-password":
			return {
				subject: "Reset your Spendid password",
				props: {
					preview: "Choose a new password.",
					heading: "Choose a new password",
					body: `Hi ${job.name}, someone asked to reset the password for your account. If it was you, choose a new one below.`,
					action: "Reset password",
					url: job.url,
					footnote: "This link works for 1 hour. If you didn't ask for it, you can ignore this email.",
				},
			};
	}
}

/** Renders any email job to subject + HTML + plain text. */
export async function renderEmail(job: EmailJob): Promise<RenderedEmail> {
	const { subject, props } = content(job);
	const element = createElement(ActionEmail, props);
	const [html, text] = await Promise.all([
		render(element),
		render(element, { plainText: true }),
	]);
	return { subject, html, text };
}
