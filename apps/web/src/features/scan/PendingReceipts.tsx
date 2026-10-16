import { formatMinor } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import { pendingReceiptsQuery, receiptImageUrl } from "@/lib/receipts-api";
import { capture } from "../capture/capture-store";

/** Receipts still being read or waiting for a quick check. Hidden when there are none. */
export function PendingReceipts() {
	const { data: receipts = [] } = useQuery(pendingReceiptsQuery);
	if (receipts.length === 0) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			aria-labelledby="pending-title"
			className="rounded-panel border-2 border-marigold/60 bg-marigold/10 p-3 sm:p-4"
		>
			<h2
				id="pending-title"
				className="px-2 pt-1 font-display text-[1.2rem] font-bold"
			>
				{receipts.length === 1
					? "1 receipt to check"
					: `${receipts.length} receipts to check`}
			</h2>
			<ul className="mt-2">
				{receipts.map((r) => (
					<li key={r.id}>
						<button
							type="button"
							onClick={() => capture.openReceipt(r.id)}
							className="flex w-full items-center gap-3 rounded-tile px-2 py-2 text-left hover:bg-marigold/15"
						>
							<img
								src={receiptImageUrl(r.id)}
								alt=""
								className="h-12 w-9 shrink-0 rounded-md border border-line object-cover object-top"
							/>
							<span className="min-w-0 flex-1">
								<span className="block font-semibold break-words">
									{r.draft?.merchant ??
										(r.status === "reading" ? "Reading…" : "Receipt")}
								</span>
								<span className="block text-[0.85rem] text-ink-soft">
									{r.status === "reading"
										? "Reading the details"
										: r.status === "failed"
											? "Couldn't read it, fill it in"
											: "Ready to check"}
								</span>
							</span>
							{r.status === "reading" ? (
								<LoaderCircle
									className="size-5 shrink-0 animate-spin text-ink-soft"
									aria-hidden="true"
								/>
							) : (
								<span className="flex shrink-0 items-center gap-1">
									{r.draft && (
										<span className="num font-bold">
											{formatMinor(r.draft.totalMinor, r.draft.currency)}
										</span>
									)}
									<ChevronRight
										className="size-5 text-ink-soft"
										aria-hidden="true"
									/>
								</span>
							)}
						</button>
					</li>
				))}
			</ul>
		</motion.section>
	);
}
