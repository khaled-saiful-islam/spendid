import { type Db, user } from "@spendid/db";
import {
	type ErrorLog,
	logErrors,
	NOTIFY_QUEUE,
	type NotifyJob,
} from "@spendid/server";
import { Queue, Worker } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import type { SendEmail } from "../email/outbox";
import type { InsightsService } from "../modules/insights/insights.service";
import type { SummaryService } from "../modules/money/summary.service";
import type { SubscriptionService } from "../modules/subscriptions/subscriptions.service";
import { createMoneyAlerts } from "./alerts";
import { createDigests } from "./digests";
import { createNotifier, type Notifier } from "./notifier";
import { createSecurityAlerts } from "./security";
import { createUnsubscribeLinks } from "./unsubscribe";

/** The email a person gets once when a call takes them past this month's AI allowance. */
export async function notifyAiLimit(
	notifier: Notifier,
	userId: string,
): Promise<void> {
	const month = new Date().toISOString().slice(0, 7);
	await notifier.notify(userId, {
		kind: "ai-limit",
		group: null,
		dedupeKey: month,
		build: ({ appUrl }) => ({
			subject: "You've used this month's AI allowance",
			preview: "Typing expenses still works as usual.",
			heading: "AI is resting until next month",
			body: "You've used this month's AI allowance, so voice, receipt reading and Ask Spendid pause until the 1st. Typing expenses, your plan and your family circle all keep working.",
			action: "Open Spendid",
			url: `${appUrl}/app`,
		}),
	});
}

/**
 * Everything email-notification related, wired once: the notifier, security and money
 * alerts, and an hourly digest job that runs inside the API (it needs the API's services).
 */
export function createNotifications(deps: {
	db: Db;
	redisUrl: string;
	sendEmail: SendEmail;
	secret: string;
	appUrl: string;
	summary: SummaryService;
	insights: InsightsService;
	subscriptions?: () => SubscriptionService | undefined;
	logError: ErrorLog;
}) {
	const links = createUnsubscribeLinks(deps.secret, deps.appUrl);
	const notifier = createNotifier({
		db: deps.db,
		sendEmail: deps.sendEmail,
		links,
		appUrl: deps.appUrl,
	});
	const digests = createDigests({
		db: deps.db,
		notifier,
		summary: deps.summary,
		insights: deps.insights,
		subscriptions: deps.subscriptions,
		logError: deps.logError,
	});
	// BullMQ workers need their own blocking connection.
	const connection = new Redis(deps.redisUrl, { maxRetriesPerRequest: null });
	const queue = new Queue<NotifyJob>(NOTIFY_QUEUE, { connection });
	logErrors("notifications", deps.logError, connection, queue);
	let worker: Worker<NotifyJob> | null = null;

	return {
		links,
		notifier,
		digests,
		security: createSecurityAlerts({ db: deps.db, notifier }),
		alerts: createMoneyAlerts({ db: deps.db, notifier }),
		aiLimit: (userId: string) => notifyAiLimit(notifier, userId),

		/** Product news to everyone who kept "Spendid news" on. */
		async broadcast(
			announcementId: string,
			subject: string,
			body: string,
		): Promise<number> {
			const people = await deps.db
				.select({ id: user.id })
				.from(user)
				.where(
					and(
						eq(user.role, "user"),
						sql`coalesce(${user.banned}, false) = false`,
					),
				);
			let sent = 0;
			for (const { id } of people) {
				const result = await notifier.notify(id, {
					kind: "announcement",
					group: "product",
					dedupeKey: announcementId,
					build: ({ appUrl }) => ({
						subject,
						preview: body.slice(0, 120),
						heading: subject,
						body,
						action: "Open Spendid",
						url: `${appUrl}/app`,
						footnote:
							"News from the Spendid team. It never includes anyone's money or data.",
					}),
				});
				if (result === "sent") sent += 1;
			}
			return sent;
		},

		/** Hourly digest tick (minute 5) and the worker's AI-limit events. */
		async start(): Promise<void> {
			await queue.upsertJobScheduler(
				"digest-tick",
				{ pattern: "5 * * * *" },
				{ name: "tick", data: { kind: "tick" } },
			);
			worker = new Worker<NotifyJob>(
				NOTIFY_QUEUE,
				async (job) => {
					if (job.data.kind === "tick") return { people: await digests.tick() };
					return notifyAiLimit(notifier, job.data.userId);
				},
				{ connection, concurrency: 1 },
			);
			logErrors("notifications worker", deps.logError, worker);
		},

		async close(): Promise<void> {
			await Promise.allSettled([worker?.close(), queue.close()]);
			await connection.quit().catch(() => undefined);
		},
	};
}

export type Notifications = ReturnType<typeof createNotifications>;
