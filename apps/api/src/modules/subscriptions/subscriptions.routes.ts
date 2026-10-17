import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireMember, type SessionLookup } from "../../auth/guards";
import type { SubscriptionService } from "./subscriptions.service";

export interface SubscriptionDeps {
	session: SessionLookup;
	subscriptions: SubscriptionService;
}

const IdParams = z.object({ id: z.uuid("Unknown subscription") });
const uid = (req: FastifyRequest): string => req.user?.id ?? "";

/** /api/subscriptions — the person's own subscriptions and regular bills. */
export async function subscriptionRoutes(
	app: FastifyInstance,
	deps: SubscriptionDeps,
): Promise<void> {
	app.addHook("preHandler", requireMember(deps.session));
	const s = deps.subscriptions;

	app.get("/subscriptions", async (req) => ({
		success: true,
		data: await s.overview(uid(req)),
	}));
	app.post("/subscriptions", async (req, reply) =>
		reply
			.code(201)
			.send({ success: true, data: await s.create(uid(req), req.body) }),
	);
	app.put("/subscriptions/:id", async (req) => ({
		success: true,
		data: await s.update(uid(req), IdParams.parse(req.params).id, req.body),
	}));
	app.post("/subscriptions/:id/paid", async (req) => ({
		success: true,
		data: await s.markPaid(uid(req), IdParams.parse(req.params).id, req.body),
	}));
	app.post("/subscriptions/:id/cancel", async (req) => ({
		success: true,
		data: await s.cancel(uid(req), IdParams.parse(req.params).id),
	}));
	app.post("/subscriptions/:id/restore", async (req) => ({
		success: true,
		data: await s.restore(uid(req), IdParams.parse(req.params).id),
	}));
	app.delete("/subscriptions/:id", async (req) => {
		await s.remove(uid(req), IdParams.parse(req.params).id);
		return { success: true, data: null };
	});
}
