import type { FastifyReply, FastifyRequest } from "fastify";

export interface SessionUser {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	role?: string | null;
	username?: string | null;
	banned?: boolean | null;
}

/** Looks up who is signed in from request headers — Better Auth in prod, a stub in tests. */
export type SessionLookup = (headers: Headers) => Promise<SessionUser | null>;

declare module "fastify" {
	interface FastifyRequest {
		user: SessionUser | null;
	}
}

export function headersOf(req: FastifyRequest): Headers {
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value !== undefined)
			headers.append(key, Array.isArray(value) ? value.join(", ") : value);
	}
	return headers;
}

/** Pre-handler: 401 unless signed in. Sets `req.user`. */
export function requireUser(lookup: SessionLookup) {
	return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
		const user = await lookup(headersOf(req));
		if (!user || user.banned) {
			reply.code(401).send({ success: false, error: "Sign in to continue." });
			return;
		}
		req.user = user;
	};
}

/** Pre-handler: 403 unless the signed-in person is an admin. */
export function requireAdmin(lookup: SessionLookup) {
	const userGuard = requireUser(lookup);
	return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
		await userGuard(req, reply);
		if (reply.sent) return;
		if (req.user?.role !== "admin") {
			reply
				.code(403)
				.send({ success: false, error: "Only admins can do this." });
		}
	};
}
