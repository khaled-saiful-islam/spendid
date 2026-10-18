import { queryOptions } from "@tanstack/react-query";
import { api } from "./http";

export interface Notice {
	id: string;
	kind: string;
	title: string;
	body: string;
	/** Where tapping it goes, inside the app. */
	path: string | null;
	createdAt: string;
	read: boolean;
}

export interface Inbox {
	unread: number;
	items: Notice[];
}

/** The bell: the latest alerts (bills due, price changes, goals reached…). */
export const noticesQuery = queryOptions({
	queryKey: ["notices"],
	queryFn: () => api<Inbox>("/api/notices"),
	staleTime: 60_000,
});

export const noticesApi = {
	markRead: () =>
		api<{ ok: boolean }>("/api/notices/read", { method: "POST", body: "{}" }),
};
