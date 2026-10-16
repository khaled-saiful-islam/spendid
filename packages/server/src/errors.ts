/** An expected failure whose message is safe to show the person. HTTP layers use `statusCode`. */
export class ServiceError extends Error {
	constructor(
		readonly statusCode: number,
		message: string,
	) {
		super(message);
		this.name = "ServiceError";
	}
}
