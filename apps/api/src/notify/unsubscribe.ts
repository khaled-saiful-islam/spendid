import { createHmac, timingSafeEqual } from "node:crypto";
import { EMAIL_GROUPS, type EmailGroup } from "@spendid/shared";

/**
 * Unsubscribe links carry who and which group, signed with the app secret, so a link can
 * only ever switch off that one group for that one person — no sign-in needed.
 */
export function createUnsubscribeLinks(secret: string, appUrl: string) {
	const sign = (userId: string, group: EmailGroup) =>
		createHmac("sha256", secret)
			.update(`unsubscribe:${userId}:${group}`)
			.digest("base64url");

	return {
		url(userId: string, group: EmailGroup): string {
			const q = new URLSearchParams({
				u: userId,
				g: group,
				t: sign(userId, group),
			});
			return `${appUrl}/unsubscribe?${q.toString()}`;
		},
		/** The API endpoint mail apps POST to for one-click unsubscribe (RFC 8058). */
		oneClickUrl(userId: string, group: EmailGroup): string {
			const q = new URLSearchParams({
				u: userId,
				g: group,
				t: sign(userId, group),
			});
			return `${appUrl}/api/email/unsubscribe?${q.toString()}`;
		},
		verify(userId: string, group: string, token: string): group is EmailGroup {
			if (!(EMAIL_GROUPS as readonly string[]).includes(group)) return false;
			const expected = Buffer.from(sign(userId, group as EmailGroup));
			const given = Buffer.from(token);
			return (
				expected.length === given.length && timingSafeEqual(expected, given)
			);
		},
	};
}

export type UnsubscribeLinks = ReturnType<typeof createUnsubscribeLinks>;
