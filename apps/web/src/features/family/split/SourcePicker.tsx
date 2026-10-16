import { formatMinor } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Camera, PencilLine, ReceiptText } from "lucide-react";
import { motion } from "motion/react";
import { dateLocale, t } from "@/i18n";
import { type ReceiptChoice, splitReceiptsQuery } from "@/lib/family-api";

/** Where the bill comes from: a new photo, a receipt Spendid already read, or typing it. */
export function SourcePicker({
	onSnap,
	onPick,
	onManual,
}: {
	onSnap: () => void;
	onPick: (receipt: ReceiptChoice) => void;
	onManual: () => void;
}) {
	const { data = [], isPending } = useQuery(splitReceiptsQuery);
	const tile =
		"flex w-full items-center gap-4 rounded-panel border-2 border-line bg-surface p-4 text-left transition-[transform,border-color] hover:-translate-y-0.5 hover:border-plum-300";
	return (
		<div className="space-y-6">
			<div className="grid gap-3 sm:grid-cols-2">
				<motion.button
					type="button"
					whileTap={{ scale: 0.97 }}
					onClick={onSnap}
					className="relative flex items-center gap-4 overflow-hidden rounded-panel bg-linear-to-br from-plum-500 to-coral p-5 text-left text-white shadow-lift"
				>
					<span className="grid size-14 shrink-0 place-items-center rounded-full bg-white/20">
						<Camera className="size-7" aria-hidden="true" />
					</span>
					<span>
						<span className="block text-[1.2rem] font-bold">
							{t("Snap the bill")}
						</span>
						<span className="block text-white/85">
							{t("Spendid reads every line for you.")}
						</span>
					</span>
				</motion.button>
				<button type="button" onClick={onManual} className={tile}>
					<span className="grid size-14 shrink-0 place-items-center rounded-full bg-marigold/20 text-marigold-deep">
						<PencilLine className="size-7" aria-hidden="true" />
					</span>
					<span>
						<span className="block text-[1.2rem] font-bold">
							{t("Type it in")}
						</span>
						<span className="block text-ink-soft">
							{t("Add the items yourself.")}
						</span>
					</span>
				</button>
			</div>
			<section aria-labelledby="recent-receipts" className="space-y-3">
				<h2 id="recent-receipts" className="text-[1.3rem] font-bold">
					{t("Or use a recent receipt")}
				</h2>
				{isPending ? (
					<div className="h-24 animate-pulse rounded-panel bg-surface-2" />
				) : data.length === 0 ? (
					<p className="text-ink-soft">
						{t("Receipts you snap show up here with their items.")}
					</p>
				) : (
					<ul className="grid gap-2 sm:grid-cols-2">
						{data.map((r) => (
							<li key={r.id}>
								<button
									type="button"
									onClick={() => onPick(r)}
									className={tile}
								>
									<span className="grid size-11 shrink-0 place-items-center rounded-full bg-plum-500/10 text-plum-500">
										<ReceiptText className="size-5" aria-hidden="true" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="block font-semibold break-words">
											{r.merchant}
										</span>
										<span className="block text-[0.88rem] text-ink-soft">
											{t("{n} items", { n: r.items.length })}
											{r.date
												? `, ${new Date(`${r.date}T12:00`).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" })}`
												: ""}
										</span>
									</span>
									<span className="num shrink-0 font-bold">
										{formatMinor(r.totalMinor, r.currency)}
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
