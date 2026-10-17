import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./app-error";

/** Turns thrown errors into the standard envelope. Validation errors name each bad field. */
export function registerErrorHandler(app: FastifyInstance): void {
	app.setErrorHandler((error: FastifyError | ZodError, req, reply) => {
		if (error instanceof ZodError) {
			const fields: Record<string, string> = {};
			for (const issue of error.issues) {
				const key = issue.path.join(".") || "_";
				fields[key] ??= issue.message;
			}
			return reply
				.code(400)
				.send({ success: false, error: "Some details need fixing.", fields });
		}
		const status = error.statusCode ?? 500;
		if (status >= 500) req.log.error({ err: error }, "request failed");
		return reply.code(status).send({
			success: false,
			// AppError messages are written for people; anything else 5xx stays generic.
			error:
				status >= 500 && !(error instanceof AppError)
					? "Something went wrong on our side. Try again."
					: error.message,
		});
	});
}
