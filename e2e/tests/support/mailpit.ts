import type { APIRequestContext } from "@playwright/test";

/** Dev mail catcher from docker-compose (port 8604). */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:8604";

interface Summary {
	ID: string;
	Subject: string;
}

/** Waits for the newest email to `to` whose subject matches, and returns its plain text. */
export async function waitForEmail(
	request: APIRequestContext,
	to: string,
	subject: RegExp,
	timeoutMs = 20_000,
): Promise<string> {
	const until = Date.now() + timeoutMs;
	while (Date.now() < until) {
		const res = await request.get(`${MAILPIT}/api/v1/search`, {
			params: { query: `to:"${to}"`, limit: 10 },
		});
		if (res.ok()) {
			const { messages } = (await res.json()) as { messages: Summary[] };
			const hit = messages.find((m) => subject.test(m.Subject));
			if (hit) {
				const msg = await request.get(`${MAILPIT}/api/v1/message/${hit.ID}`);
				const { Text } = (await msg.json()) as { Text: string };
				return Text;
			}
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`No email to ${to} matching ${subject} within ${timeoutMs} ms`);
}

/** The first link in an email body that points at `pathPart`. */
export function linkIn(text: string, pathPart: string): string {
	const link = text.match(/https?:\/\/\S+/g)?.find((u) => u.includes(pathPart));
	if (!link) throw new Error(`No ${pathPart} link in the email`);
	return link.replace(/[)>.,]+$/, "");
}
