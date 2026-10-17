import type {
	ChallengeBoard,
	ChallengeView,
	StartChallenge,
	Wish,
	WishInput,
	WishList,
} from "@spendid/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./http";

export const challengesQuery = queryOptions({
	queryKey: ["challenges"],
	queryFn: () => api<ChallengeBoard>("/api/challenges"),
});

export const wishesQuery = queryOptions({
	queryKey: ["wishes"],
	queryFn: () => api<WishList>("/api/wishes"),
});

const json = (method: string, body?: unknown): RequestInit => ({
	method,
	body: body === undefined ? undefined : JSON.stringify(body),
});

export const delightApi = {
	addWish: (input: WishInput) => api<Wish>("/api/wishes", json("POST", input)),
	decide: (id: string, decision: "bought" | "skipped") =>
		api<Wish>(`/api/wishes/${id}/decide`, json("POST", { decision })),
	removeWish: (id: string) => api<null>(`/api/wishes/${id}`, json("DELETE")),
	startChallenge: (input: StartChallenge) =>
		api<ChallengeView>("/api/challenges", json("POST", input)),
	giveUpChallenge: (id: string) =>
		api<null>(`/api/challenges/${id}/give-up`, json("POST", {})),
};
