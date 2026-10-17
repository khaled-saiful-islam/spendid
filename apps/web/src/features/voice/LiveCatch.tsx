import { formatMinor } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Quote } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { categoriesQuery } from "@/lib/money-api";
import type { LiveNote } from "./useVoiceCapture";

const dayLabel = (n: number) =>
	n === 0 ? null : n === 1 ? t("Yesterday") : t("{n} days ago", { n });

/** Expenses appearing one by one while the person is still talking. */
export function LiveCatch({ live }: { live: LiveNote }) {
	const { data: categories = [] } = useQuery(categoriesQuery);
	const last = live.heard.at(-1);
	if (live.drafts.length === 0 && !last && !live.working) return null;

	return (
		<div className="space-y-3 text-left">
			<AnimatePresence mode="popLayout">
				{last && (
					<motion.p
						key={last}
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						className="flex gap-2 text-[0.95rem] text-ink-soft"
					>
						<Quote
							className="mt-0.5 size-4 shrink-0 text-marigold-deep"
							aria-hidden="true"
						/>
						<span className="break-words">{last}</span>
					</motion.p>
				)}
			</AnimatePresence>
			<div className="flex items-center justify-between gap-3">
				<p className="font-semibold">
					{live.drafts.length === 0
						? t("Listening for amounts…")
						: live.drafts.length === 1
							? t("Caught 1 so far")
							: t("Caught {n} so far", { n: live.drafts.length })}
				</p>
				{live.working && (
					<span role="status" className="inline-flex items-center gap-1">
						<span className="sr-only">{t("Reading…")}</span>
						{[0, 1, 2].map((i) => (
							<motion.span
								key={i}
								className="size-1.5 rounded-full bg-plum-500"
								animate={{ opacity: [0.25, 1, 0.25] }}
								transition={{
									duration: 1,
									repeat: Number.POSITIVE_INFINITY,
									delay: i * 0.15,
								}}
							/>
						))}
					</span>
				)}
			</div>
			<ul className="space-y-2" aria-live="polite">
				<AnimatePresence initial={false}>
					{live.drafts.map((d, i) => {
						const cat = categories.find((c) => c.id === d.categoryId);
						const day = dayLabel(d.daysAgo);
						return (
							<motion.li
								// Drafts only ever get appended while listening.
								// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
								key={i}
								layout
								initial={{ opacity: 0, y: 18, scale: 0.9 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								transition={{ type: "spring", stiffness: 320, damping: 22 }}
								className="flex items-center gap-3 rounded-tile border border-line bg-surface p-2.5 shadow-sm"
							>
								<CategoryIcon icon={cat?.icon} tint={cat?.tint} size="sm" />
								<span className="min-w-0 flex-1">
									<span className="block font-semibold break-words">
										{d.merchant}
									</span>
									<span className="block text-[0.85rem] text-ink-soft">
										{cat ? t(cat.name) : t("Other")}
										{day ? `, ${day}` : ""}
									</span>
								</span>
								<span className="num shrink-0 font-bold">
									{formatMinor(d.amountMinor, d.currency)}
								</span>
							</motion.li>
						);
					})}
				</AnimatePresence>
			</ul>
			{live.missed && (
				<p className="text-[0.9rem] text-coral">
					{t("Missed one bit. Say it again if something's not on the list.")}
				</p>
			)}
		</div>
	);
}
