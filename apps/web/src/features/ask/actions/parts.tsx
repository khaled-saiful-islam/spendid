import type { ReactNode } from "react";
import { dateLocale, t } from "@/i18n";

/** A visual on the left, words on the right; text wraps, never cut. */
export function Row({
	visual,
	children,
}: {
	visual: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center gap-4">
			<div className="shrink-0">{visual}</div>
			<div className="min-w-0 flex-1 space-y-1">{children}</div>
		</div>
	);
}

export function Title({ children }: { children: ReactNode }) {
	return (
		<p className="font-display text-[1.3rem] font-bold break-words">
			{children}
		</p>
	);
}

export function Note({ children }: { children: ReactNode }) {
	return <p className="text-[0.92rem] text-ink-soft">{children}</p>;
}

/** "old → new", with the old value quiet and the new one strong. */
export function Change({ from, to }: { from: ReactNode; to: ReactNode }) {
	return (
		<p className="num break-words">
			<span className="text-ink-soft line-through decoration-ink-soft/50">
				{from}
			</span>
			{" → "}
			<strong>{to}</strong>
		</p>
	);
}

/** A round icon tile in the card's left column. */
export function IconTile({
	children,
	tone = "plum",
}: {
	children: ReactNode;
	tone?: "plum" | "coral" | "jade" | "marigold";
}) {
	const tones = {
		plum: "bg-plum-500/12 text-plum-500",
		coral: "bg-coral/15 text-coral",
		jade: "bg-jade/15 text-safe",
		marigold: "bg-marigold/20 text-marigold-deep",
	};
	return (
		<span
			className={`grid size-16 place-items-center rounded-full ${tones[tone]}`}
		>
			{children}
		</span>
	);
}

export const dayLabel = (day: string) =>
	new Date(`${day}T12:00`).toLocaleDateString(dateLocale(), {
		weekday: "short",
		day: "numeric",
		month: "short",
	});

export const monthLabel = (day: string) =>
	new Date(`${day}T12:00`).toLocaleDateString(dateLocale(), {
		month: "short",
		year: "numeric",
	});

/** Whole months from now until a YYYY-MM-DD date, at least 1. */
export function monthsUntil(date: string): number {
	const end = new Date(`${date}T12:00`);
	const now = new Date();
	const months =
		(end.getFullYear() - now.getFullYear()) * 12 +
		end.getMonth() -
		now.getMonth();
	return Math.max(1, months);
}

export const noDeadline = () => t("No deadline");
