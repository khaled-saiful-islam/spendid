import { AppSettingsSchema } from "@spendid/server";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { headersOf, requireAdmin, type SessionLookup } from "../../auth/guards";
import type { AdminRepository } from "./admin.repository";
import type { AdminService } from "./admin.service";

export interface AdminDeps {
	session: SessionLookup;
	repo: AdminRepository;
	service: AdminService;
}

const IdParams = z.object({ id: z.string().min(1).max(64) });
const ListQuery = z.object({
	q: z.string().trim().max(80).optional(),
	before: z.iso.datetime().optional(),
});
const PauseBody = z.object({ reason: z.string().trim().max(300).nullish() });
const AiBody = z.object({
	monthlyTokens: z.number().int().min(0).max(100_000_000).nullable(),
	enabled: z.boolean(),
});
const actor = (req: FastifyRequest): string => req.user?.id ?? "";

/** /api/admin/* — accounts and the app. No route here touches anyone's money. */
export async function adminRoutes(
	app: FastifyInstance,
	deps: AdminDeps,
): Promise<void> {
	app.addHook("preHandler", requireAdmin(deps.session));

	app.get("/admin/overview", async () => ({
		success: true,
		data: await deps.service.overview(),
	}));

	app.get("/admin/users", async (req) => {
		const q = ListQuery.parse(req.query);
		return {
			success: true,
			data: await deps.repo.listUsers({
				q: q.q || undefined,
				before: q.before,
				limit: 25,
			}),
		};
	});

	app.post("/admin/users/:id/pause", async (req) => {
		const { id } = IdParams.parse(req.params);
		const { reason } = PauseBody.parse(req.body ?? {});
		await deps.service.pause(actor(req), id, reason ?? null, headersOf(req));
		return { success: true, data: null };
	});

	app.post("/admin/users/:id/restore", async (req) => {
		const { id } = IdParams.parse(req.params);
		await deps.service.restore(actor(req), id, headersOf(req));
		return { success: true, data: null };
	});

	app.delete("/admin/users/:id", async (req) => {
		const { id } = IdParams.parse(req.params);
		await deps.service.remove(actor(req), id, headersOf(req));
		return { success: true, data: null };
	});

	app.post("/admin/users/:id/reset-password", async (req) => {
		const { id } = IdParams.parse(req.params);
		await deps.service.sendReset(actor(req), id);
		return { success: true, data: null };
	});

	app.put("/admin/users/:id/ai", async (req) => {
		const { id } = IdParams.parse(req.params);
		await deps.service.setAi(actor(req), id, AiBody.parse(req.body));
		return { success: true, data: null };
	});

	app.put("/admin/settings", async (req) => {
		const patch = AppSettingsSchema.partial().parse(req.body);
		return {
			success: true,
			data: await deps.service.updateSettings(actor(req), patch),
		};
	});

	app.get("/admin/audit", async () => ({
		success: true,
		data: await deps.repo.auditTrail(60),
	}));
}
