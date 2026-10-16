import Fastify, {
	type FastifyInstance,
	type FastifyServerOptions,
} from "fastify";
import { type AccountDeps, accountRoutes } from "./auth/account.routes";
import type { Auth } from "./auth/auth";
import type { SessionLookup } from "./auth/guards";
import { authRoutes } from "./auth/routes";
import { registerErrorHandler } from "./http/errors";
import { type AdminDeps, adminRoutes } from "./modules/admin/admin.routes";
import { type AskDeps, askRoutes } from "./modules/ask/ask.routes";
import {
	type CaptureDeps,
	captureRoutes,
} from "./modules/capture/capture.routes";
import {
	type DelightDeps,
	delightRoutes,
} from "./modules/delight/delight.routes";
import { type FamilyDeps, familyRoutes } from "./modules/family/family.routes";
import {
	type HealthChecks,
	healthRoutes,
} from "./modules/health/health.routes";
import {
	type InsightsDeps,
	insightsRoutes,
} from "./modules/insights/insights.routes";
import type { MeRepository } from "./modules/me/me.repository";
import { meRoutes } from "./modules/me/me.routes";
import { type MoneyDeps, moneyRoutes } from "./modules/money/money.routes";
import {
	type PrivacyDeps,
	privacyRoutes,
} from "./modules/privacy/privacy.routes";
import {
	type ReceiptDeps,
	receiptRoutes,
} from "./modules/receipts/receipts.routes";
import { type NotifyDeps, notifyRoutes } from "./notify/notify.routes";

export interface AppDeps {
	checks: HealthChecks;
	checkTimeoutMs?: number;
	logger?: FastifyServerOptions["logger"];
	version?: string;
	/** Full Better Auth instance — mounts /api/auth/*. Omitted in unit tests. */
	auth?: Auth;
	/** Account help that sits beside Better Auth (resend confirmation by username). */
	account?: AccountDeps;
	me?: { session: SessionLookup; repo: MeRepository };
	money?: MoneyDeps;
	capture?: CaptureDeps;
	receipts?: ReceiptDeps;
	ask?: AskDeps;
	admin?: AdminDeps;
	family?: FamilyDeps;
	insights?: InsightsDeps;
	notify?: NotifyDeps;
	delight?: DelightDeps;
	privacy?: PrivacyDeps;
}

/** Builds the Fastify app without listening, so tests can `inject` requests. */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
	const app = Fastify({
		logger: deps.logger ?? false,
		trustProxy: true,
		bodyLimit: 1_048_576,
	});
	app.decorateRequest("user", null);
	registerErrorHandler(app);

	await app.register(
		async (api) => {
			await api.register(healthRoutes, {
				checks: deps.checks,
				timeoutMs: deps.checkTimeoutMs ?? 1500,
				version: deps.version ?? "0.0.0",
			});
			if (deps.auth) await api.register(authRoutes, { auth: deps.auth });
			if (deps.account) await api.register(accountRoutes, deps.account);
			if (deps.me) await api.register(meRoutes, deps.me);
			if (deps.money) await api.register(moneyRoutes, deps.money);
			if (deps.capture) await api.register(captureRoutes, deps.capture);
			if (deps.receipts) await api.register(receiptRoutes, deps.receipts);
			if (deps.ask) await api.register(askRoutes, deps.ask);
			if (deps.admin) await api.register(adminRoutes, deps.admin);
			if (deps.family) await api.register(familyRoutes, deps.family);
			if (deps.insights) await api.register(insightsRoutes, deps.insights);
			if (deps.notify) await api.register(notifyRoutes, deps.notify);
			if (deps.delight) await api.register(delightRoutes, deps.delight);
			if (deps.privacy) await api.register(privacyRoutes, deps.privacy);
		},
		{ prefix: "/api" },
	);

	return app;
}
