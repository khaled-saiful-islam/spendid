import { EMAIL_GROUP_INFO } from "@spendid/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireMember, type SessionLookup } from "../auth/guards";
import { badRequest } from "../http/app-error";
import type { Notifier } from "./notifier";
import { type Push, PushDeviceSchema } from "./push";
import type { UnsubscribeLinks } from "./unsubscribe";

export interface NotifyDeps {
	session: SessionLookup;
	notifier: Notifier;
	links: UnsubscribeLinks;
	/** Phone notifications; absent when not set up. */
	push?: Push;
}

const PushOff = z.object({ endpoint: z.url().max(1000) });

const Unsubscribe = z.object({
	u: z.string().min(1).max(64),
	g: z.string().min(1).max(20),
	t: z.string().min(20).max(80),
});

const uid = (req: FastifyRequest): string => req.user?.id ?? "";

/** Unsubscribe works without signing in: the signed link is the permission. */
async function publicRoutes(
	app: FastifyInstance,
	deps: NotifyDeps,
): Promise<void> {
	// Mail apps' one-click unsubscribe posts a form body; the link's query is what counts.
	app.addContentTypeParser(
		"application/x-www-form-urlencoded",
		{ parseAs: "string" },
		(_req, _body, done) => done(null, {}),
	);
	app.post("/email/unsubscribe", async (req) => {
		const params = Unsubscribe.safeParse({
			...(req.query as object),
			...((req.body as object) ?? {}),
		});
		if (
			!params.success ||
			!deps.links.verify(params.data.u, params.data.g, params.data.t)
		)
			throw badRequest(
				"This unsubscribe link isn't valid. Change your emails in Spendid's settings instead.",
			);
		const group = params.data.g as keyof typeof EMAIL_GROUP_INFO;
		await deps.notifier.unsubscribe(params.data.u, group);
		return {
			success: true,
			data: { group, label: EMAIL_GROUP_INFO[group].label },
		};
	});
}

async function memberRoutes(
	app: FastifyInstance,
	deps: NotifyDeps,
): Promise<void> {
	app.addHook("preHandler", requireMember(deps.session));
	app.get("/me/notifications", async (req) => ({
		success: true,
		data: await deps.notifier.prefs(uid(req)),
	}));
	app.put("/me/notifications", async (req) => ({
		success: true,
		data: await deps.notifier.setPrefs(uid(req), req.body),
	}));
	/** The bell: this person's latest alerts and how many are unread. */
	app.get("/notices", async (req) => ({
		success: true,
		data: await deps.notifier.inbox(uid(req)),
	}));
	app.post("/notices/read", async (req) => {
		await deps.notifier.markRead(uid(req));
		return { success: true, data: { ok: true } };
	});

	/** The key a browser needs to turn on phone notifications (null: not set up here). */
	app.get("/push/key", async () => ({
		success: true,
		data: { publicKey: deps.push?.publicKey ?? null },
	}));
	app.post("/push/subscribe", async (req) => {
		if (!deps.push?.publicKey)
			throw badRequest("Phone notifications aren't set up on this server.");
		const device = PushDeviceSchema.parse(req.body);
		await deps.push.subscribe(
			uid(req),
			device,
			req.headers["user-agent"] ?? null,
		);
		return { success: true, data: { ok: true } };
	});
	app.post("/push/unsubscribe", async (req) => {
		const { endpoint } = PushOff.parse(req.body);
		await deps.push?.unsubscribe(uid(req), endpoint);
		return { success: true, data: { ok: true } };
	});
	/** "Send a test": proves this phone gets them. */
	app.post("/push/test", async (req) => {
		const delivered =
			(await deps.push?.deliver(uid(req), {
				title: "Notifications are on",
				body: "Spendid will tell you here when a bill is due or something needs a look.",
				path: "/app",
			})) ?? 0;
		return { success: true, data: { delivered } };
	});
}

export async function notifyRoutes(
	app: FastifyInstance,
	deps: NotifyDeps,
): Promise<void> {
	await app.register(publicRoutes, deps);
	await app.register(memberRoutes, deps);
}
