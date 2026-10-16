import Fastify, {
	type FastifyInstance,
	type FastifyServerOptions,
} from "fastify";
import {
	type HealthChecks,
	healthRoutes,
} from "./modules/health/health.routes";

export interface AppDeps {
	checks: HealthChecks;
	checkTimeoutMs?: number;
	logger?: FastifyServerOptions["logger"];
	version?: string;
}

/** Builds the Fastify app without listening, so tests can `inject` requests. */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
	const app = Fastify({ logger: deps.logger ?? false, trustProxy: true });

	await app.register(
		async (api) => {
			await api.register(healthRoutes, {
				checks: deps.checks,
				timeoutMs: deps.checkTimeoutMs ?? 1500,
				version: deps.version ?? "0.0.0",
			});
		},
		{ prefix: "/api" },
	);

	return app;
}
