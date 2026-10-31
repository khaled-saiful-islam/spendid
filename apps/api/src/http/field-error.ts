import { ZodError } from "zod";

/** A 400 that names the field, like a validation error ("cycle.startsOn"). */
export function fieldError(field: string, message: string): ZodError {
	return new ZodError([
		{ code: "custom", path: field.split("."), message, input: undefined },
	]);
}
