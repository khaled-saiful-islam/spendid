import { createDb } from "@spendid/db";
import {
	createAiGuard,
	createAppSettings,
	createEventHub,
	createExpenseExtractor,
	createFileStore,
	createMerchantMemory,
	createPublisher,
	createTranscriber,
	type ErrorLog,
	guardProcess,
	logErrors,
	MERCHANT_QUEUE,
	stderrLog,
} from "@spendid/server";
import { Queue } from "bullmq";
import { buildApp } from "./app";
import { createAuth, sessionLookup } from "./auth/auth";
import { loadEnv } from "./config/env";
import { createOutbox } from "./email/outbox";
import { createRedis } from "./infra/redis";
import { createAdminRepository } from "./modules/admin/admin.repository";
import { createAdminService } from "./modules/admin/admin.service";
import { createAskAgent } from "./modules/ask/ask.agent";
import { createThreadRepository } from "./modules/ask/threads.repository";
import { createVoiceService } from "./modules/capture/voice.service";
import { createChallengeService } from "./modules/delight/challenges.service";
import { createDelightService } from "./modules/delight/delight.service";
import { createFamilyRepository } from "./modules/family/family.repository";
import {
	createFamilyService,
	EMAIL_QUIET_MS,
} from "./modules/family/family.service";
import { createJarsService } from "./modules/family/jars.service";
import { createPulseService } from "./modules/family/pulse.service";
import { createSplitService } from "./modules/family/split.service";
import { createInsightsService } from "./modules/insights/insights.service";
import { createMeRepository } from "./modules/me/me.repository";
import { createCategoryRepository } from "./modules/money/categories.repository";
import { createFxRepository } from "./modules/money/fx.repository";
import { createPlanRepository } from "./modules/money/plan.repository";
import { createSummaryService } from "./modules/money/summary.service";
import { createTransactionRepository } from "./modules/money/transactions.repository";
import { createTransactionService } from "./modules/money/transactions.service";
import { createAccountFiles } from "./modules/privacy/account-files";
import { createPrivacyService } from "./modules/privacy/privacy.service";
import {
	createReceiptService,
	RECEIPT_QUEUE,
} from "./modules/receipts/receipts.service";
import { createSubscriptionService } from "./modules/subscriptions/subscriptions.service";
import { createNotifications } from "./notify";

const env = loadEnv();
if (!env.RECEIPT_ENCRYPTION_KEY) {
	throw new Error(
		"RECEIPT_ENCRYPTION_KEY is missing. Run `make env` or set it in .env (openssl rand -base64 32).",
	);
}
// stderr until the app's logger exists, then pino.
let log: ErrorLog = stderrLog("api");
const logError: ErrorLog = (message, err) => log(message, err);
guardProcess(logError);

const database = createDb(env.DATABASE_URL);
const cache = createRedis(env.REDIS_URL, logError);
const outbox = createOutbox(database.db, cache.redis, logError);
const summary = createSummaryService(database.db);
const insights = createInsightsService(database.db);
const notifications = createNotifications({
	db: database.db,
	redisUrl: env.REDIS_URL,
	sendEmail: outbox.send,
	secret: env.BETTER_AUTH_SECRET,
	appUrl: env.APP_URL,
	summary,
	insights,
	// Built further down (it needs expenses, which need these notifications).
	subscriptions: () => subscriptionService,
	logError,
});
const fileStore = createFileStore({
	root: env.RECEIPTS_DIR,
	keyBase64: env.RECEIPT_ENCRYPTION_KEY,
});
const accountFiles = createAccountFiles({
	db: database.db,
	store: fileStore,
	logError,
});
const auth = createAuth({
	env,
	db: database.db,
	redis: cache.redis,
	sendEmail: outbox.send,
	events: {
		sessionCreated: notifications.security.sessionCreated,
		passkeyAdded: notifications.security.passkeyAdded,
		userDeleting: accountFiles.collect,
		userDeleted: accountFiles.remove,
	},
});
const session = sessionLookup(auth);
const adminRepo = createAdminRepository(database.db);
const categories = createCategoryRepository(database.db);
const transactions = createTransactionRepository(database.db);
const fx = createFxRepository(database.db);
const plan = createPlanRepository(database.db);
const publish = createPublisher(cache.redis);
const merchants = createMerchantMemory(database.db);
const merchantQueue = new Queue<{ merchantId: string }>(MERCHANT_QUEUE, {
	connection: cache.redis,
});
const familyRepo = createFamilyRepository(database.db);
const transactionService = createTransactionService({
	db: database.db,
	transactions,
	categories,
	fx,
	merchants,
	onCreated: (userId, transactionId) =>
		Promise.all([
			notifications.alerts.afterExpense(userId, transactionId),
			subscriptionService.noticePayment(userId, transactionId),
		]),
	onNewMerchant: (merchantId) =>
		merchantQueue.add(
			"match",
			{ merchantId },
			{ attempts: 3, removeOnComplete: 500 },
		),
	logError,
	onChange: async (ownerId) => {
		const viewers = await familyRepo.expenseViewers(ownerId);
		await Promise.all(
			viewers.map((id) => publish(id, { type: "family", what: "pulse" })),
		);
	},
});
const subscriptionService = createSubscriptionService({
	db: database.db,
	categories,
	addExpense: (userId, input) => transactionService.create(userId, input),
});
const events = createEventHub(env.REDIS_URL, logError);
const receiptQueue = new Queue<{ receiptId: string }>(RECEIPT_QUEUE, {
	connection: cache.redis,
});
logErrors("queues", logError, merchantQueue, receiptQueue);
const receiptService = createReceiptService({
	db: database.db,
	queue: receiptQueue,
	transactions: transactionService,
	store: fileStore,
});
const familyDeps = { db: database.db, repo: familyRepo, publish };
const ilmu = { baseUrl: env.ILMU_BASE_URL, apiKey: env.ILMU_API_KEY };
const settings = createAppSettings({
	db: database.db,
	redis: cache.redis,
	defaults: {
		aiEnabled: true,
		defaultMonthlyTokens: env.AI_MONTHLY_TOKENS_DEFAULT,
	},
});
const guard = createAiGuard({
	settings,
	db: database.db,
	redis: cache.redis,
	defaultMonthlyTokens: env.AI_MONTHLY_TOKENS_DEFAULT,
	configured: env.ILMU_API_KEY.length > 0,
	onLimitReached: notifications.aiLimit,
});

// Shared by their routes and Ask Spendid's lookups.
const challengeService = createChallengeService(database.db);
const familyService = createFamilyService({
	...familyDeps,
	sendEmail: outbox.send,
	appUrl: env.APP_URL,
	receiptImage: (ownerId, id) => receiptService.image(ownerId, id),
	familyEmail: {
		wanted: async (userId) =>
			(await notifications.notifier.prefs(userId)).family,
		unsubscribeUrl: (userId) => notifications.links.url(userId, "family"),
	},
	allowEmail: async (key) =>
		(await cache.redis.set(
			`email-quiet:${key}`,
			"1",
			"PX",
			EMAIL_QUIET_MS,
			"NX",
		)) === "OK",
});
const jarsService = createJarsService({
	...familyDeps,
	onDeposit: notifications.alerts.afterDeposit,
});

const app = await buildApp({
	checks: { database: database.ping, redis: cache.ping },
	version: process.env.npm_package_version ?? "0.0.0",
	auth,
	account: { auth, db: database.db },
	me: { session, repo: createMeRepository(database.db) },
	money: {
		session,
		categories,
		transactions,
		transactionService,
		summary,
		plan,
		merchants,
		onDeposit: notifications.alerts.afterDeposit,
	},
	receipts: {
		session,
		events,
		receipts: receiptService,
	},
	admin: {
		session,
		repo: adminRepo,
		service: createAdminService({
			repo: adminRepo,
			auth,
			settings,
			sendEmail: outbox.send,
			appUrl: env.APP_URL,
		}),
	},
	insights: { session, insights },
	delight: {
		session,
		delight: createDelightService(database.db),
		challenges: challengeService,
	},
	subscriptions: { session, subscriptions: subscriptionService },
	privacy: {
		session,
		privacy: createPrivacyService({
			db: database.db,
			store: fileStore,
			auth,
			notifier: notifications.notifier,
			sendEmail: outbox.send,
			publish,
			appUrl: env.APP_URL,
		}),
	},
	notify: {
		session,
		notifier: notifications.notifier,
		links: notifications.links,
	},
	family: {
		session,
		family: familyService,
		pulse: createPulseService(familyDeps),
		jars: jarsService,
		splits: createSplitService({ ...familyDeps, appUrl: env.APP_URL }),
	},
	ask: {
		session,
		threads: createThreadRepository(database.db),
		ask: createAskAgent({
			db: database.db,
			guard,
			categories,
			summary,
			plan,
			// Read-only lookups for the change tools; every change itself goes through the card.
			subscriptions: subscriptionService,
			challenges: challengeService,
			family: familyService,
			jars: jarsService,
			notifier: notifications.notifier,
			receipts: receiptService,
			ilmu: { ...ilmu, model: env.ILMU_TEXT_MODEL },
		}),
	},
	capture: {
		session,
		guard,
		voice: createVoiceService({
			db: database.db,
			guard,
			categories,
			transcriber: createTranscriber({ ...ilmu, model: env.ILMU_ASR_MODEL }),
			extract: createExpenseExtractor({ ...ilmu, model: env.ILMU_TEXT_MODEL }),
			asrModel: env.ILMU_ASR_MODEL,
			merchants,
		}),
	},
	logger:
		env.NODE_ENV === "development"
			? { level: env.LOG_LEVEL, transport: { target: "pino-pretty" } }
			: { level: env.LOG_LEVEL },
});

log = (message, err) => app.log.error({ err }, message);

/** Under Docker's 10-second stop window, so a stuck close still exits on our terms. */
const SHUTDOWN_GRACE_MS = 8_000;

async function shutdown(signal: string): Promise<void> {
	app.log.info({ signal }, "shutting down");
	setTimeout(() => {
		app.log.error("shutdown took too long; exiting");
		process.exit(1);
	}, SHUTDOWN_GRACE_MS).unref();
	await app.close();
	await Promise.allSettled([
		outbox.close(),
		receiptQueue.close(),
		merchantQueue.close(),
		events.close(),
		notifications.close(),
		database.close(),
		cache.close(),
	]);
	process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await notifications.start();
await app.listen({ host: "0.0.0.0", port: env.API_PORT });
