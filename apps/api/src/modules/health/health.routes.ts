import type { Health, ServiceStatus } from "@spendid/shared";
import type { FastifyInstance } from "fastify";

/** A probe resolves true when its service answers. */
export type HealthCheck = () => Promise<boolean>;

export interface HealthChecks {
	database: HealthCheck;
	redis: HealthCheck;
}

interface HealthRouteOptions {
	checks: HealthChecks;
	timeoutMs: number;
	version: string;
}

async function probe(
	check: HealthCheck,
	timeoutMs: number,
): Promise<ServiceStatus> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<boolean>((resolve) => {
		timer = setTimeout(() => resolve(false), timeoutMs);
	});
	try {
		return (await Promise.race([check(), timeout])) ? "up" : "down";
	} catch {
		return "down";
	} finally {
		clearTimeout(timer);
	}
}

export async function healthRoutes(
	app: FastifyInstance,
	opts: HealthRouteOptions,
): Promise<void> {
	app.get("/health", async (_req, reply) => {
		const [database, redis] = await Promise.all([
			probe(opts.checks.database, opts.timeoutMs),
			probe(opts.checks.redis, opts.timeoutMs),
		]);
		const allUp = database === "up" && redis === "up";
		const body: Health = {
			status: allUp ? "ok" : "degraded",
			version: opts.version,
			uptimeSeconds: Math.round(process.uptime()),
			services: { database, redis },
		};
		return reply.code(allUp ? 200 : 503).send(body);
	});
}
