/** An expected failure with a message that is safe to show the person. */
export class AppError extends Error {
	constructor(
		readonly statusCode: number,
		message: string,
		/** `cause` keeps the underlying error for the logs. */
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "AppError";
	}
}

export const notFound = (what: string): AppError =>
	new AppError(404, `${what} not found.`);
export const badRequest = (message: string): AppError =>
	new AppError(400, message);
