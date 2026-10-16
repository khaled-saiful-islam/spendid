import type { Me } from "@spendid/shared";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { homeFor, meQuery } from "./me";

/** For signed-in pages: returns the person or sends them to sign in. */
export async function requireMe(queryClient: QueryClient): Promise<Me> {
	const me = await queryClient.ensureQueryData(meQuery);
	if (!me) throw redirect({ to: "/signin" });
	return me;
}

/** For the money app: admins go to their console, new people finish onboarding first. */
export async function requireMember(queryClient: QueryClient): Promise<Me> {
	const me = await requireMe(queryClient);
	if (me.user.role === "admin") throw redirect({ to: "/admin" });
	if (me.needsOnboarding) throw redirect({ to: "/onboarding" });
	return me;
}

export async function requireAdmin(queryClient: QueryClient): Promise<Me> {
	const me = await requireMe(queryClient);
	if (me.user.role !== "admin") throw redirect({ to: "/app" });
	return me;
}

/** For sign-in / sign-up pages: skip them when already signed in. */
export async function redirectIfSignedIn(
	queryClient: QueryClient,
): Promise<void> {
	const me = await queryClient.ensureQueryData(meQuery);
	if (me) throw redirect({ to: homeFor(me) });
}

/** Reads an optional string search param safely. */
export function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 && value.length < 2000
		? value
		: undefined;
}
