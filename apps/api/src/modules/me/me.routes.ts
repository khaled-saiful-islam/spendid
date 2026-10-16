import { ProfileInputSchema } from "@spendid/shared";
import type { FastifyInstance } from "fastify";
import { headersOf, requireUser, type SessionLookup } from "../../auth/guards";
import type { MeRepository } from "./me.repository";

interface MeRouteOptions {
	session: SessionLookup;
	repo: MeRepository;
}

export async function meRoutes(
	app: FastifyInstance,
	opts: MeRouteOptions,
): Promise<void> {
	const guard = requireUser(opts.session);

	// Signed-out visitors get `data: null` (not a 401) so every page can ask "who am I?" quietly.
	app.get("/me", async (req) => {
		const user = await opts.session(headersOf(req));
		if (!user || user.banned) return { success: true, data: null };
		return { success: true, data: await opts.repo.find(user.id) };
	});

	app.put("/me/profile", { preHandler: guard }, async (req) => {
		const input = ProfileInputSchema.parse(req.body);
		return {
			success: true,
			data: await opts.repo.saveProfile(req.user?.id ?? "", input),
		};
	});
}
