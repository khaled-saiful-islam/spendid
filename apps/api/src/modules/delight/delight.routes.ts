import type { WishInput } from "@spendid/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireMember, type SessionLookup } from "../../auth/guards";
import type { ChallengeService } from "./challenges.service";
import type { DelightService } from "./delight.service";

export interface DelightDeps {
	session: SessionLookup;
	delight: DelightService;
	challenges?: ChallengeService;
}

const IdParams = z.object({ id: z.uuid("Unknown wish") });
const ChallengeParams = z.object({ id: z.uuid("Unknown challenge") });
const uid = (req: FastifyRequest): string => req.user?.id ?? "";
const ok = <T>(data: T) => ({ success: true as const, data });

export async function delightRoutes(
	app: FastifyInstance,
	deps: DelightDeps,
): Promise<void> {
	app.addHook("preHandler", requireMember(deps.session));
	const { delight } = deps;

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

	const challenges = deps.challenges;
	if (challenges) {
		app.get("/challenges", async (req) => ok(await challenges.board(uid(req))));
		app.post("/challenges", async (req, reply) =>
			reply.code(201).send(ok(await challenges.start(uid(req), req.body))),
		);
		app.post("/challenges/:id/give-up", async (req) => {
			await challenges.giveUp(uid(req), ChallengeParams.parse(req.params).id);
			return ok(null);
		});
	}
}
