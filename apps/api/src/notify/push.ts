import { type Db, pushSubscription } from "@spendid/db";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";

/** What a browser hands over when push is turned on (PushSubscription.toJSON()). */
export const PushDeviceSchema = z.object({
	endpoint: z.url().max(1000),
	keys: z.object({
		p256dh: z.string().min(1).max(200),
		auth: z.string().min(1).max(100),
	}),
});
export type PushDevice = z.infer<typeof PushDeviceSchema>;

export interface PushMessage {
	title: string;
	body: string;
	/** Where tapping the notification goes, inside the app. */
	path: string | null;
}

/** Sends one encrypted message to one device; swapped out in tests. */
export type PushSender = (device: PushDevice, payload: string) => Promise<void>;

/** A day: a reminder that can't be delivered by then isn't worth showing late. */
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Phone notifications (web push). Off when no keys are set: the bell and emails still work.
 * Each device belongs to whoever turned push on there last.
 */
export function createPush(deps: {
	db: Db;
	publicKey: string;
	privateKey: string;
	subject: string;
	sender?: PushSender;
}) {
	const { db } = deps;
	const enabled = Boolean(deps.publicKey && deps.privateKey);
	const send: PushSender =
		deps.sender ??
		(async (device, payload) => {
			await webpush.sendNotification(device, payload, {
				TTL: TTL_SECONDS,
				vapidDetails: {
					subject: deps.subject,
					publicKey: deps.publicKey,
					privateKey: deps.privateKey,
				},
			});
		});

	return {
		/** The key browsers need to subscribe, or null when push is off. */
		publicKey: enabled ? deps.publicKey : null,

		async subscribe(
			userId: string,
			device: PushDevice,
			userAgent: string | null,
		): Promise<void> {
			const values = {
				userId,
				endpoint: device.endpoint,
				p256dh: device.keys.p256dh,
				auth: device.keys.auth,
				userAgent: userAgent?.slice(0, 300) ?? null,
			};
			await db
				.insert(pushSubscription)
				.values(values)
				.onConflictDoUpdate({ target: pushSubscription.endpoint, set: values });
		},

		async unsubscribe(userId: string, endpoint: string): Promise<void> {
			await db
				.delete(pushSubscription)
				.where(
					and(
						eq(pushSubscription.userId, userId),
						eq(pushSubscription.endpoint, endpoint),
					),
				);
		},

		/** Sends to every device the person turned push on; returns how many got it. */
		async deliver(userId: string, message: PushMessage): Promise<number> {
			if (!enabled) return 0;
			const devices = await db
				.select()
				.from(pushSubscription)
				.where(eq(pushSubscription.userId, userId));
			const payload = JSON.stringify({
				title: message.title,
				body: message.body,
				url: message.path ?? "/app",
			});
			let delivered = 0;
			for (const d of devices) {
				try {
					await send(
						{ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
						payload,
					);
					delivered += 1;
				} catch (err) {
					// 404/410: the browser dropped this subscription (app removed, permission off).
					const status = (err as { statusCode?: number }).statusCode;
					if (status === 404 || status === 410)
						await db
							.delete(pushSubscription)
							.where(eq(pushSubscription.id, d.id));
				}
			}
			return delivered;
		},
	};
}

export type Push = ReturnType<typeof createPush>;
