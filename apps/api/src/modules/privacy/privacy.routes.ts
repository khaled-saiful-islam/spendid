import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
	headersOf,
	requireMember,
	type SessionLookup,
} from "../../auth/guards";
import type { PrivacyService } from "./privacy.service";

export interface PrivacyDeps {
	session: SessionLookup;
	privacy: PrivacyService;
}

const IdParams = z.object({ id: z.uuid("Unknown export") });
const uid = (req: FastifyRequest): string => req.user?.id ?? "";

/** /api/me/export and DELETE /api/me — the person's own data only. */
export async function privacyRoutes(
	app: FastifyInstance,
	deps: PrivacyDeps,
): Promise<void> {
	app.addHook("preHandler", requireMember(deps.session));

	app.get("/me/export", async (req) => ({
		success: true,
		data: await deps.privacy.latestExport(uid(req)),
	}));
	app.post("/me/export", async (req, reply) =>
		reply.code(202).send({
			success: true,
			data: await deps.privacy.requestExport(uid(req), req.log),
		}),
	);
	app.get("/me/exports/:id/download", async (req, reply) => {
		const { id } = IdParams.parse(req.params);
		const bytes = await deps.privacy.download(uid(req), id);
		const day = new Date().toISOString().slice(0, 10);
		return reply
			.header("Content-Type", "application/zip")
			.header(
				"Content-Disposition",
				`attachment; filename="spendid-${day}.zip"`,
			)
			.header("Cache-Control", "private, no-store")
			.send(bytes);
	});

	app.delete("/me", async (req) => {
		await deps.privacy.deleteAccount(
			uid(req),
			req.body,
			headersOf(req),
			req.log,
		);
		return { success: true, data: null };
	});
}
