import { type Me, MeSchema, type ProfileInput } from "@spendid/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./http";

/** The signed-in person, or null when signed out. Route guards read this. */
export const meQuery = queryOptions({
	queryKey: ["me"],
	queryFn: async (): Promise<Me | null> => {
		const me = await api<Me | null>("/api/me");
		return me === null ? null : MeSchema.parse(me);
	},
	staleTime: 60_000,
});

export function saveProfile(input: ProfileInput): Promise<Me> {
	return api<Me>("/api/me/profile", {
		method: "PUT",
		body: JSON.stringify(input),
	});
}

/** Where someone belongs right after signing in. */
export function homeFor(me: Me): "/admin" | "/onboarding" | "/app" {
	if (me.user.role === "admin") return "/admin";
	return me.needsOnboarding ? "/onboarding" : "/app";
}
