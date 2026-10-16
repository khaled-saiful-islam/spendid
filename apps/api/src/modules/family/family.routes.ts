import type {
	InviteInput,
	ReactionInput,
	ShareUpdate,
	SplitInput,
} from "@spendid/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
	headersOf,
	requireMember,
	type SessionLookup,
} from "../../auth/guards";
import type { FamilyService } from "./family.service";
import type { JarsService } from "./jars.service";
import type { PulseService } from "./pulse.service";
import type { SplitService } from "./split.service";

export interface FamilyDeps {
	session: SessionLookup;
	family: FamilyService;
	pulse: PulseService;
	jars: JarsService;
	splits: SplitService;
}

const Token = z.object({
	token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "That link isn't complete"),
});
const Person = z.object({ userId: z.string().min(1).max(64) });
const IdParams = z.object({ id: z.uuid("Unknown item") });
const GoalParams = z.object({ goalId: z.uuid("Unknown jar") });
const ReceiptParams = Person.extend({ receiptId: z.uuid("Unknown receipt") });

const uid = (req: FastifyRequest): string => req.user?.id ?? "";
const ok = <T>(data: T) => ({ success: true as const, data });

/** Links anyone with the URL may open: invite previews and split links. No money beyond the split. */
async function publicRoutes(
	app: FastifyInstance,
	deps: FamilyDeps,
): Promise<void> {
	app.get("/family/invites/:token", async (req) => {
		const { token } = Token.parse(req.params);
		const viewer = await deps.session(headersOf(req)).catch(() => null);
		return ok(await deps.family.previewInvite(token, viewer?.id ?? null));
	});
	app.get("/splits/public/:token", async (req) => {
		const { token } = Token.parse(req.params);
		return ok(await deps.splits.publicView(token));
	});
}

async function memberRoutes(
	app: FastifyInstance,
	deps: FamilyDeps,
): Promise<void> {
	app.addHook("preHandler", requireMember(deps.session));
	const { family, pulse, jars, splits } = deps;

	app.get("/family", async (req) => ok(await family.overview(uid(req))));
	app.post("/family/invites", async (req, reply) =>
		reply
			.code(201)
			.send(ok(await family.createInvite(uid(req), req.body as InviteInput))),
	);
	app.delete("/family/invites/:id", async (req) => {
		await family.revokeInvite(uid(req), IdParams.parse(req.params).id);
		return ok(null);
	});
	app.post("/family/invites/:token/accept", async (req) => {
		await family.acceptInvite(
			uid(req),
			Token.parse(req.params).token,
			req.body,
		);
		return ok(null);
	});

	app.put("/family/people/:userId/share", async (req) =>
		ok(
			await family.updateShare(
				uid(req),
				Person.parse(req.params).userId,
				req.body as ShareUpdate,
			),
		),
	);
	app.delete("/family/people/:userId", async (req) => {
		await family.leave(uid(req), Person.parse(req.params).userId);
		return ok(null);
	});
	app.get("/family/people/:userId/view", async (req) =>
		ok(await family.viewOf(uid(req), Person.parse(req.params).userId)),
	);
	app.get("/family/people/:userId/preview", async (req) =>
		ok(await family.previewFor(uid(req), Person.parse(req.params).userId)),
	);
	app.get(
		"/family/people/:userId/receipts/:receiptId/image",
		async (req, reply) => {
			const { userId, receiptId } = ReceiptParams.parse(req.params);
			const { bytes, mime } = await family.receiptImage(
				uid(req),
				userId,
				receiptId,
			);
			return reply
				.header("Content-Type", mime)
				.header("Cache-Control", "private, no-store")
				.send(bytes);
		},
	);

	app.get("/family/pulse", async (req) => ok(await pulse.feed(uid(req))));
	app.post("/family/reactions", async (req) => {
		await pulse.react(uid(req), req.body as ReactionInput);
		return ok(null);
	});

	app.get("/family/jars", async (req) => ok(await jars.overview(uid(req))));
	app.put("/family/jars/:goalId/members", async (req) => {
		await jars.setMembers(
			uid(req),
			GoalParams.parse(req.params).goalId,
			req.body,
		);
		return ok(null);
	});
	app.post("/family/jars/:goalId/deposit", async (req) => {
		await jars.deposit(uid(req), GoalParams.parse(req.params).goalId, req.body);
		return ok(null);
	});
	app.delete("/family/jars/:goalId/membership", async (req) => {
		await jars.leave(uid(req), GoalParams.parse(req.params).goalId);
		return ok(null);
	});

	app.get("/splits", async (req) => ok(await splits.list(uid(req))));
	app.get("/splits/with-me", async (req) => ok(await splits.withMe(uid(req))));
	app.get("/splits/receipts", async (req) =>
		ok(await splits.receiptChoices(uid(req))),
	);
	app.post("/splits", async (req, reply) =>
		reply
			.code(201)
			.send(ok(await splits.create(uid(req), req.body as SplitInput))),
	);
	app.get("/splits/:id", async (req) =>
		ok(await splits.get(uid(req), IdParams.parse(req.params).id)),
	);
	app.put("/splits/:id/paid", async (req) =>
		ok(await splits.setPaid(uid(req), IdParams.parse(req.params).id, req.body)),
	);
	app.delete("/splits/:id", async (req) => {
		await splits.remove(uid(req), IdParams.parse(req.params).id);
		return ok(null);
	});
}

export async function familyRoutes(
	app: FastifyInstance,
	deps: FamilyDeps,
): Promise<void> {
	await app.register(publicRoutes, deps);
	await app.register(memberRoutes, deps);
}
