import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireMember, type SessionLookup } from "../../auth/guards";
import type { InsightsService } from "./insights.service";

export interface InsightsDeps {
	session: SessionLookup;
	insights: InsightsService;
}

const MonthQuery = z.object({
	month: z
		.string()
		.regex(/^\d{4}-\d{2}$/, "Use a month like 2026-10")
		.optional(),
});

const uid = (req: FastifyRequest): string => req.user?.id ?? "";

export async function insightsRoutes(
	app: FastifyInstance,
	deps: InsightsDeps,
): Promise<void> {
	app.addHook("preHandler", requireMember(deps.session));

	app.get("/insights/recurring", async (req) => ({
		success: true,
		data: await deps.insights.recurring(uid(req)),
	}));
	app.get("/insights/heatmap", async (req) => ({
		success: true,
		data: await deps.insights.heatmap(
			uid(req),
			MonthQuery.parse(req.query).month,
		),
	}));
	app.get("/insights/wrapped", async (req) => ({
		success: true,
		data: await deps.insights.wrapped(
			uid(req),
			MonthQuery.parse(req.query).month,
		),
	}));
}
