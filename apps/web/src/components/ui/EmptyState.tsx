import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
	icon: LucideIcon;
	title: string;
	body: string;
	milestone: string;
}

/** Placeholder for screens still being built — says what will live here and when. */
export function EmptyState({
	icon: Icon,
	title,
	body,
	milestone,
}: EmptyStateProps) {
	return (
		<div className="bg-scales grid place-items-center rounded-panel border border-line px-6 py-16 text-center">
			<span className="grid size-16 place-items-center rounded-full bg-surface shadow-lift">
				<Icon className="size-7 text-plum-500" aria-hidden="true" />
			</span>
			<h1 className="mt-5 text-[1.8rem] font-bold">{title}</h1>
			<p className="mt-2 max-w-[40ch] text-ink-soft">{body}</p>
			<span className="mt-5 rounded-full bg-surface-2 px-3 py-1 text-[0.82rem] font-medium text-ink-soft">
				Arrives in {milestone}
			</span>
		</div>
	);
}
