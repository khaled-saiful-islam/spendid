import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Auth } from "./auth";

/** Converts a Fastify request into a Web Request for Better Auth's handler. */
function toWebRequest(req: FastifyRequest): Request {
	const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value !== undefined)
			headers.append(key, Array.isArray(value) ? value.join(", ") : value);
	}
	const hasBody =
		req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined;
	return new Request(url, {
		method: req.method,
		headers,
		body: hasBody ? JSON.stringify(req.body) : undefined,
	});
}

async function sendWebResponse(
	reply: FastifyReply,
	response: Response,
): Promise<void> {
	reply.status(response.status);
	for (const [key, value] of response.headers) {
		if (key === "set-cookie") continue;
		reply.header(key, value);
	}
	const cookies = response.headers.getSetCookie();
	if (cookies.length > 0) reply.header("set-cookie", cookies);
	reply.send(response.body ? await response.text() : null);
}

/** Mounts every Better Auth endpoint under /api/auth/*. */
export async function authRoutes(
	app: FastifyInstance,
	opts: { auth: Auth },
): Promise<void> {
	app.route({
		method: ["GET", "POST"],
		url: "/auth/*",
		handler: async (req, reply) => {
			try {
				await sendWebResponse(
					reply,
					await opts.auth.handler(toWebRequest(req)),
				);
			} catch (error) {
				req.log.error({ err: error }, "auth handler failed");
				reply.status(500).send({
					success: false,
					error: "Sign-in service had a problem. Try again.",
				});
			}
		},
	});
}
