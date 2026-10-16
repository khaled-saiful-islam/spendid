import type { ApiResponse } from "@spendid/shared";

/** Error carrying the API's plain-language message and per-field problems. */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly fields: Record<string, string> = {},
	) {
		super(message);
	}
}

/** Calls the JSON API and unwraps the `{ success, data }` envelope. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path, {
			...init,
			credentials: "same-origin",
			// Only say "JSON" when there is a body: the API rejects an empty JSON body.
			headers: {
				...(init.body != null && { "Content-Type": "application/json" }),
				...init.headers,
			},
		});
	} catch {
		throw new ApiError(
			"Can't reach Spendid. Check your connection and try again.",
			0,
		);
	}
	const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
	if (!body)
		throw new ApiError(
			"Spendid sent an unexpected reply. Try again.",
			res.status,
		);
	if (!body.success) throw new ApiError(body.error, res.status, body.fields);
	return body.data;
}
