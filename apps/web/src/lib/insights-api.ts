import type { Heatmap, RecurringOverview, Wrapped } from "@spendid/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./http";

export const recurringQuery = queryOptions({
	queryKey: ["insights", "recurring"],
	queryFn: () => api<RecurringOverview>("/api/insights/recurring"),
});

export const heatmapQuery = (month: string) =>
	queryOptions({
		queryKey: ["insights", "heatmap", month],
		queryFn: () => api<Heatmap>(`/api/insights/heatmap?month=${month}`),
	});

export const wrappedQuery = (month: string) =>
	queryOptions({
		queryKey: ["insights", "wrapped", month],
		queryFn: () => api<Wrapped>(`/api/insights/wrapped?month=${month}`),
	});

/** "2026-10" for the month this device is in. */
export const thisMonth = (): string => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const shiftMonth = (month: string, by: number): string => {
	const [y, m] = month.split("-").map(Number) as [number, number];
	const d = new Date(y, m - 1 + by, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const monthName = (
	month: string,
	opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" },
): string => new Date(`${month}-15T12:00`).toLocaleDateString(undefined, opts);
