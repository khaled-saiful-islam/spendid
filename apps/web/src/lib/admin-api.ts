import { queryOptions } from "@tanstack/react-query";
import { api } from "./http";

export interface AdminOverview {
	people: {
		total: number;
		banned: number;
		newThisWeek: number;
		activeThisWeek: number;
	};
	ai: {
		tokensMonth: number;
		tokensToday: number;
		callsToday: number;
		byFeature: { feature: string; tokens: number; calls: number }[];
		daily: { day: string; tokens: number }[];
	};
	email: {
		type: string;
		status: "queued" | "sent" | "failed";
		count: number;
	}[];
	settings: { aiEnabled: boolean; defaultMonthlyTokens: number };
}

export interface AdminPerson {
	id: string;
	name: string;
	email: string;
	username: string | null;
	role: string;
	emailVerified: boolean;
	banned: boolean;
	banReason: string | null;
	createdAt: string;
	lastActiveAt: string | null;
	ai: { usedTokens: number; limitTokens: number | null; enabled: boolean };
}

export interface AuditEntry {
	id: string;
	action: string;
	targetLabel: string | null;
	detail: unknown;
	createdAt: string;
	actorName: string | null;
}

export const overviewQuery = queryOptions({
	queryKey: ["admin", "overview"],
	queryFn: () => api<AdminOverview>("/api/admin/overview"),
	refetchInterval: 15_000,
});

export const peopleQuery = (q: string) =>
	queryOptions({
		queryKey: ["admin", "people", q],
		queryFn: () =>
			api<{ items: AdminPerson[]; nextBefore: string | null }>(
				`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
			),
	});

export const auditQuery = queryOptions({
	queryKey: ["admin", "audit"],
	queryFn: () => api<AuditEntry[]>("/api/admin/audit"),
});

const send = (method: string, path: string, body?: unknown) =>
	api<unknown>(path, {
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
	});

export const adminApi = {
	pause: (id: string, reason: string | null) =>
		send("POST", `/api/admin/users/${id}/pause`, { reason }),
	restore: (id: string) => send("POST", `/api/admin/users/${id}/restore`, {}),
	remove: (id: string) => send("DELETE", `/api/admin/users/${id}`),
	sendReset: (id: string) =>
		send("POST", `/api/admin/users/${id}/reset-password`, {}),
	setAi: (id: string, monthlyTokens: number | null, enabled: boolean) =>
		send("PUT", `/api/admin/users/${id}/ai`, { monthlyTokens, enabled }),
	settings: (patch: Partial<AdminOverview["settings"]>) =>
		send("PUT", "/api/admin/settings", patch),
};

export const formatTokens = (n: number) =>
	new Intl.NumberFormat(undefined, {
		notation: n >= 100_000 ? "compact" : "standard",
	}).format(n);

export const FEATURE_NAMES: Record<string, string> = {
	ask: "Ask Spendid",
	"voice-listen": "Voice: listening",
	"voice-understand": "Voice: understanding",
	"receipt-read": "Receipt reading",
};
