import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TINTS } from "@/components/money/CategoryIcon";
import { cn } from "@/lib/cn";

/**
 * A page section's heading: one size everywhere, with a round icon in the section's own
 * colour so each part of a page is easy to find again. `tint` is a CategoryIcon tint name.
 */
export function SectionHeader({
	id,
	title,
	icon: Icon,
	tint,
	sub,
	action,
}: {
	id: string;
	title: ReactNode;
	icon: LucideIcon;
	tint: string;
	sub?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex min-w-0 flex-1 items-center gap-2.5">
				<span
					className={cn(
						"grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br text-white shadow-sm",
						TINTS[tint] ?? TINTS.slate,
					)}
					aria-hidden="true"
				>
					<Icon className="size-4" />
				</span>
				<div className="min-w-0">
					<h2 id={id} className="text-[1.15rem] leading-tight font-bold">
						{title}
					</h2>
					{sub && (
						<p className="text-[0.85rem] leading-snug text-ink-soft">{sub}</p>
					)}
				</div>
			</div>
			{action && <div className="shrink-0">{action}</div>}
		</div>
	);
}
