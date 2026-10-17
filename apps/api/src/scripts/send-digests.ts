import { createDb, user } from "@spendid/db";
import { stderrLog } from "@spendid/server";
import { eq } from "drizzle-orm";
import { loadEnv } from "../config/env";
import { createOutbox } from "../email/outbox";
import { createRedis } from "../infra/redis";
import { createInsightsService } from "../modules/insights/insights.service";
import { createCategoryRepository } from "../modules/money/categories.repository";
import { createSummaryService } from "../modules/money/summary.service";
import { createSubscriptionService } from "../modules/subscriptions/subscriptions.service";
import { createNotifications } from "../notify";

// `make digests u=maya` — send that person's weekly summary, bill, subscription, warranty and Wrapped
// emails now instead of waiting for their scheduled hour. Each still sends only once.
const username = process.argv[2];
if (!username) throw new Error("Usage: send-digests <username>");
const env = loadEnv();
const database = createDb(env.DATABASE_URL, 2);
const logError = stderrLog("digests");
const cache = createRedis(env.REDIS_URL, logError);
const outbox = createOutbox(database.db, cache.redis, logError);
// Digests only read subscriptions; nothing here logs a payment.
const subscriptions = createSubscriptionService({
	db: database.db,
	categories: createCategoryRepository(database.db),
	addExpense: () => Promise.reject(new Error("not available in send-digests")),
});
const notifications = createNotifications({
	db: database.db,
	redisUrl: env.REDIS_URL,
	sendEmail: outbox.send,
	logError,
	secret: env.BETTER_AUTH_SECRET,
	appUrl: env.APP_URL,
	summary: createSummaryService(database.db),
	insights: createInsightsService(database.db),
	subscriptions: () => subscriptions,
});
const [person] = await database.db
	.select({ id: user.id })
	.from(user)
	.where(eq(user.username, username))
	.limit(1);
if (!person) throw new Error(`No one called ${username}`);
await notifications.digests.runAllFor(person.id);
process.stdout.write(`[digests] queued for ${username} (open Mailpit)\n`);
await Promise.allSettled([notifications.close(), outbox.close()]);
await database.close();
await cache.close();
process.exit(0);
