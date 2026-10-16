import { type Health, HealthSchema } from "@spendid/shared";

/** Fetches API health; resolves (never throws) so the UI can show "offline". */
export async function fetchHealth(): Promise<Health | null> {
	try {
		const res = await fetch("/api/health");
		return HealthSchema.parse(await res.json());
	} catch {
		return null;
	}
}
