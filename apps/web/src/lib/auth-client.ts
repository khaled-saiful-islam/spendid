import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Same-origin client: Vite (dev) and the web server (prod) proxy /api to the API. */
export const authClient = createAuthClient({
	plugins: [usernameClient(), adminClient(), passkeyClient()],
});

interface AuthErrorLike {
	code?: string;
	message?: string;
	status?: number;
}

const MESSAGES: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD:
		"That email and password don't match. Check both and try again.",
	INVALID_USERNAME_OR_PASSWORD:
		"That username and password don't match. Check both and try again.",
	EMAIL_NOT_VERIFIED:
		"Confirm your email first. We sent you a link when you signed up.",
	USER_ALREADY_EXISTS:
		"There's already an account with this email. Sign in instead.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"There's already an account with this email. Sign in instead.",
	PASSWORD_TOO_SHORT: "Use at least 8 characters for your password.",
	INVALID_TOKEN:
		"This link has expired or was already used. Ask for a new one.",
	BANNED_USER:
		"This account has been paused by Spendid. Contact support if you think this is a mistake.",
};

/** Plain-language message for a Better Auth error. */
export function authErrorMessage(
	error: AuthErrorLike | null | undefined,
): string {
	if (!error) return "Something went wrong. Try again.";
	if (error.status === 429)
		return "Too many tries in a short time. Wait a minute, then try again.";
	return (
		(error.code && MESSAGES[error.code]) ||
		error.message ||
		"Something went wrong. Try again."
	);
}
