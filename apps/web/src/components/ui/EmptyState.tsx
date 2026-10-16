import type { LucideIcon } from "lucide-react";
import { t } from "@/i18n";

interface EmptyStateProps {
	icon: LucideIcon;
	title: string;
	body: string;
	milestone: string;
	/** Use 2 when the page already has its own h1. */
	level?: 1 | 2;
}

/** Placeholder for screens still being built — says what will live here and when. */
export function EmptyState({
	icon: Icon,
	title,
	body,
	milestone,
	level = 1,
}: EmptyStateProps) {
	const Heading = level === 1 ? "h1" : "h2";
	return (
		<div className="bg-scales grid place-items-center rounded-panel border border-line px-6 py-16 text-center">
			<span className="grid size-16 place-items-center rounded-full bg-surface shadow-lift">
				<Icon className="size-7 text-plum-500" aria-hidden="true" />
			</span>
			<Heading className="mt-5 text-[1.8rem] font-bold">{title}</Heading>
			<p className="mt-2 max-w-[40ch] text-ink-soft">{body}</p>
			<span className="mt-5 rounded-full bg-surface-2 px-3 py-1 text-[0.82rem] font-medium text-ink-soft">
				{t("Arrives in {when}", { when: milestone })}
			</span>
		</div>
	);
}
