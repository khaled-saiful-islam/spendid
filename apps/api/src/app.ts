import Fastify, {
	type FastifyInstance,
	type FastifyServerOptions,
} from "fastify";
import type { Auth } from "./auth/auth";
import type { SessionLookup } from "./auth/guards";
import { authRoutes } from "./auth/routes";
import { registerErrorHandler } from "./http/errors";
import {
	type CaptureDeps,
	captureRoutes,
} from "./modules/capture/capture.routes";
import {
	type HealthChecks,
	healthRoutes,
} from "./modules/health/health.routes";
import type { MeRepository } from "./modules/me/me.repository";
import { meRoutes } from "./modules/me/me.routes";
import { type MoneyDeps, moneyRoutes } from "./modules/money/money.routes";

export interface AppDeps {
	checks: HealthChecks;
	checkTimeoutMs?: number;
	logger?: FastifyServerOptions["logger"];
	version?: string;
	/** Full Better Auth instance — mounts /api/auth/*. Omitted in unit tests. */
	auth?: Auth;
	me?: { session: SessionLookup; repo: MeRepository };
	money?: MoneyDeps;
	capture?: CaptureDeps;
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
			if (deps.me) await api.register(meRoutes, deps.me);
			if (deps.money) await api.register(moneyRoutes, deps.money);
			if (deps.capture) await api.register(captureRoutes, deps.capture);
		},
		{ prefix: "/api" },
	);

	return app;
}
