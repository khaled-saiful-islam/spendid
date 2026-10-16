import type { WishInput } from "@spendid/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireMember, type SessionLookup } from "../../auth/guards";
import type { DelightService } from "./delight.service";

export interface DelightDeps {
	session: SessionLookup;
	delight: DelightService;
}

const IdParams = z.object({ id: z.uuid("Unknown wish") });
const uid = (req: FastifyRequest): string => req.user?.id ?? "";
const ok = <T>(data: T) => ({ success: true as const, data });

export async function delightRoutes(
	app: FastifyInstance,
	deps: DelightDeps,
): Promise<void> {
	app.addHook("preHandler", requireMember(deps.session));
	const { delight } = deps;

	app.get("/streak", async (req) => ok(await delight.streak(uid(req))));
	app.post("/check-ins", async (req) =>
		ok(await delight.checkIn(uid(req), req.body)),
	);

	app.get("/wishes", async (req) => ok(await delight.wishes(uid(req))));
	app.post("/wishes", async (req, reply) =>
		reply
			.code(201)
			.send(ok(await delight.addWish(uid(req), req.body as WishInput))),
	);
	app.post("/wishes/:id/decide", async (req) =>
		ok(await delight.decide(uid(req), IdParams.parse(req.params).id, req.body)),
	);
	app.delete("/wishes/:id", async (req) => {
		await delight.remove(uid(req), IdParams.parse(req.params).id);
		return ok(null);
	});
}
