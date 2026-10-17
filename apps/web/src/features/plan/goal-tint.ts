import { TINTS } from "@/components/money/CategoryIcon";

const GOAL_TINTS = ["amber", "lime", "sky", "teal", "rose", "cyan"];

/** Each goal keeps one colour everywhere (Plan and Home), picked from its id. */
export function goalTint(id: string): string {
	let h = 0;
	for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return TINTS[GOAL_TINTS[h % GOAL_TINTS.length] ?? "amber"] ?? "";
}
