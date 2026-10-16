import type {
	FamilyOverview,
	InviteCreated,
	InviteInput,
	InvitePreview,
	PulseItem,
	ReactionInput,
	SharedJar,
	SharedView,
	ShareLevel,
	ShareState,
	ShareUpdate,
	SplitDto,
	SplitInput,
} from "@spendid/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "./http";

export interface JarsOverview {
	jars: SharedJar[];
	myGoals: { id: string; name: string; emoji: string }[];
}

export interface ReceiptChoice {
	id: string;
	merchant: string;
	date: string | null;
	currency: string;
	totalMinor: number;
	taxMinor: number | null;
	items: { name: string; totalMinor: number }[];
}

export const familyQuery = queryOptions({
	queryKey: ["family", "overview"],
	queryFn: () => api<FamilyOverview>("/api/family"),
});

export const pulseQuery = queryOptions({
	queryKey: ["family", "pulse"],
	queryFn: () => api<PulseItem[]>("/api/family/pulse"),
});

export const jarsQuery = queryOptions({
	queryKey: ["family", "jars"],
	queryFn: () => api<JarsOverview>("/api/family/jars"),
});

export const viewQuery = (userId: string) =>
	queryOptions({
		queryKey: ["family", "view", userId],
		queryFn: () => api<SharedView>(`/api/family/people/${userId}/view`),
		retry: false,
	});

export const previewQuery = (userId: string) =>
	queryOptions({
		queryKey: ["family", "preview", userId],
		queryFn: () => api<SharedView>(`/api/family/people/${userId}/preview`),
		retry: false,
	});

export const inviteQuery = (token: string) =>
	queryOptions({
		queryKey: ["family", "invite", token],
		queryFn: () => api<InvitePreview>(`/api/family/invites/${token}`),
		retry: false,
	});

export const splitsQuery = queryOptions({
	queryKey: ["family", "splits"],
	queryFn: () => api<SplitDto[]>("/api/splits"),
});

export const splitsWithMeQuery = queryOptions({
	queryKey: ["family", "splits-with-me"],
	queryFn: () => api<SplitDto[]>("/api/splits/with-me"),
});

export const splitReceiptsQuery = queryOptions({
	queryKey: ["family", "split-receipts"],
	queryFn: () => api<ReceiptChoice[]>("/api/splits/receipts"),
});

export const publicSplitQuery = (token: string) =>
	queryOptions({
		queryKey: ["split-link", token],
		queryFn: () => api<SplitDto>(`/api/splits/public/${token}`),
		retry: false,
	});

const json = (method: string, body?: unknown): RequestInit => ({
	method,
	body: body === undefined ? undefined : JSON.stringify(body),
});

export const familyApi = {
	invite: (input: InviteInput) =>
		api<InviteCreated>("/api/family/invites", json("POST", input)),
	cancelInvite: (id: string) =>
		api<null>(`/api/family/invites/${id}`, json("DELETE")),
	accept: (token: string, level: ShareLevel) =>
		api<null>(`/api/family/invites/${token}/accept`, json("POST", { level })),
	share: (userId: string, update: ShareUpdate) =>
		api<ShareState>(`/api/family/people/${userId}/share`, json("PUT", update)),
	leave: (userId: string) =>
		api<null>(`/api/family/people/${userId}`, json("DELETE")),
	react: (input: ReactionInput) =>
		api<null>("/api/family/reactions", json("POST", input)),
	setJarMembers: (goalId: string, userIds: string[]) =>
		api<null>(`/api/family/jars/${goalId}/members`, json("PUT", { userIds })),
	depositJar: (goalId: string, amountMinor: number) =>
		api<null>(
			`/api/family/jars/${goalId}/deposit`,
			json("POST", { amountMinor }),
		),
	leaveJar: (goalId: string) =>
		api<null>(`/api/family/jars/${goalId}/membership`, json("DELETE")),
	createSplit: (input: SplitInput) =>
		api<SplitDto>("/api/splits", json("POST", input)),
	setPaid: (id: string, key: string, paid: boolean) =>
		api<SplitDto>(`/api/splits/${id}/paid`, json("PUT", { key, paid })),
	removeSplit: (id: string) => api<null>(`/api/splits/${id}`, json("DELETE")),
};

/** After any family change: refresh the circle, pulse, jars and goals. */
export const refreshFamily = (queryClient: QueryClient) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: ["family"] }),
		queryClient.invalidateQueries({ queryKey: ["goals"] }),
	]);

export const receiptImageUrl = (ownerId: string, receiptId: string) =>
	`/api/family/people/${ownerId}/receipts/${receiptId}/image`;
