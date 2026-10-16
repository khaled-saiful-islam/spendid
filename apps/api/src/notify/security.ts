import { createHash } from "node:crypto";
import { type Db, knownDevice } from "@spendid/db";
import { and, eq, sql } from "drizzle-orm";
import type { Notifier } from "./notifier";

/** "Chrome on macOS" from a user-agent string. Coarse on purpose: browser updates don't count as new. */
export function deviceLabel(userAgent: string | null | undefined): string {
	const ua = userAgent ?? "";
	const browser = /Edg\//.test(ua)
		? "Edge"
		: /OPR\//.test(ua)
			? "Opera"
			: /Firefox\//.test(ua)
				? "Firefox"
				: /Chrome\//.test(ua)
					? "Chrome"
					: /Safari\//.test(ua)
						? "Safari"
						: "A browser";
	const os = /iPhone/.test(ua)
		? "iPhone"
		: /iPad/.test(ua)
			? "iPad"
			: /Android/.test(ua)
				? "Android"
				: /Mac OS X/.test(ua)
					? "macOS"
					: /Windows/.test(ua)
						? "Windows"
						: /Linux/.test(ua)
							? "Linux"
							: "an unknown device";
	return `${browser} on ${os}`;
}

/** New-device sign-ins and passkeys: always emailed, never held for quiet hours. */
export function createSecurityAlerts(deps: { db: Db; notifier: Notifier }) {
	const { db, notifier } = deps;
	return {
		async sessionCreated(s: {
			userId: string;
			userAgent?: string | null;
		}): Promise<void> {
			const label = deviceLabel(s.userAgent);
			const fingerprint = createHash("sha256")
				.update(label)
				.digest("hex")
				.slice(0, 32);
			const [{ known } = { known: 0 }] = await db
				.select({ known: sql<number>`count(*)::int` })
				.from(knownDevice)
				.where(eq(knownDevice.userId, s.userId));
			const inserted = await db
				.insert(knownDevice)
				.values({ userId: s.userId, fingerprint, label })
				.onConflictDoNothing()
				.returning({ fingerprint: knownDevice.fingerprint });
			if (inserted.length === 0) {
				await db
					.update(knownDevice)
					.set({ lastSeen: new Date() })
					.where(
						and(
							eq(knownDevice.userId, s.userId),
							eq(knownDevice.fingerprint, fingerprint),
						),
					);
				return;
			}
			// The very first device is just "you"; tell people about the next ones.
			if (known === 0) return;
			const when = new Date().toUTCString();
			await notifier.notify(s.userId, {
				kind: "new-sign-in",
				group: null,
				urgent: true,
				build: ({ appUrl }) => ({
					subject: `New sign-in to Spendid from ${label}`,
					preview: `Someone signed in from ${label}.`,
					heading: "A new sign-in",
					body: `Your account was just used to sign in from ${label}. If this was you, there's nothing to do. If it wasn't, reset your password now.`,
					rows: [
						{ label: "Device", value: label },
						{ label: "When", value: when },
					],
					action: "Reset my password",
					url: `${appUrl}/forgot`,
					footnote:
						"We send this the first time a new kind of device signs in.",
				}),
			});
		},

		async passkeyAdded(userId: string): Promise<void> {
			await notifier.notify(userId, {
				kind: "passkey-added",
				group: null,
				urgent: true,
				build: ({ appUrl }) => ({
					subject: "A passkey was added to your Spendid account",
					preview: "You can now unlock Spendid with this passkey.",
					heading: "New passkey added",
					body: "A passkey was just added to your account, so it can unlock Spendid with a fingerprint, face or device PIN. If you didn't add it, remove it in Settings and reset your password.",
					action: "Open settings",
					url: `${appUrl}/app/me`,
				}),
			});
		},
	};
}

export type SecurityAlerts = ReturnType<typeof createSecurityAlerts>;
