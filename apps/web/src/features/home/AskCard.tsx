import { Link } from "@tanstack/react-router";
import { ChevronRight, Sparkles } from "lucide-react";

const QUICK = [
	"Where did my money go this week?",
	"Am I on track for my goals?",
];

/** A doorway to Ask Spendid with two one-tap questions. */
export function AskCard() {
	return (
		<section
			aria-labelledby="ask-title"
			className="rounded-panel border border-line bg-surface p-5"
		>
			<div className="flex items-center gap-3">
				<span className="grid size-11 shrink-0 place-items-center rounded-full bg-marigold text-plum-900">
					<Sparkles className="size-5" aria-hidden="true" />
				</span>
				<h2 id="ask-title" className="min-w-0 flex-1 text-[1.3rem] font-bold">
					Ask about your money
				</h2>
				<Link
					to="/app/ask"
					aria-label="Open Ask Spendid"
					className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-2"
				>
					<ChevronRight className="size-5" />
				</Link>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				{QUICK.map((q) => (
					<Link
						key={q}
						to="/app/ask"
						search={{ q }}
						className="rounded-full bg-surface-2 px-3.5 py-2 text-[0.9rem] font-medium hover:bg-plum-500/12"
					>
						{q}
					</Link>
				))}
			</div>
		</section>
	);
}
