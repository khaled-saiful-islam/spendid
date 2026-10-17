import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { t } from "@/i18n";

const QUICK = [
	"Where did my money go this week?",
	"Am I on track for my goals?",
];

/** A doorway to Ask Spendid: one tap to ask, or one of two ready questions. */
export function AskCard() {
	return (
		<section
			aria-labelledby="ask-title"
			className="rounded-panel border border-line bg-surface p-2.5"
		>
			<h2 id="ask-title" className="sr-only">
				{t("Ask about your money")}
			</h2>
			<Link
				to="/app/ask"
				className="flex items-center gap-3 rounded-tile bg-surface-2 px-3 py-2.5 hover:bg-plum-500/10"
			>
				<span className="grid size-9 shrink-0 place-items-center rounded-full bg-marigold text-plum-900">
					<Sparkles className="size-[1.1rem]" aria-hidden="true" />
				</span>
				<span className="min-w-0 flex-1 font-semibold">
					{t("Ask anything about your money")}
				</span>
				<ArrowRight
					className="size-4 shrink-0 text-ink-soft"
					aria-hidden="true"
				/>
			</Link>
			<div className="mt-2 flex flex-wrap gap-1.5 px-0.5">
				{QUICK.map((q) => (
					<Link
						key={q}
						to="/app/ask"
						search={{ q: t(q) }}
						className="rounded-full border border-line px-3 py-1.5 text-[0.85rem] font-medium text-ink-soft hover:border-plum-500/50 hover:text-ink"
					>
						{t(q)}
					</Link>
				))}
			</div>
		</section>
	);
}
