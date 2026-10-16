import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { buttonClass } from "@/components/ui/Button";
import { t } from "@/i18n";
import { receiptImageUrl, receiptQuery } from "@/lib/receipts-api";
import { capture } from "../capture/capture-store";
import { ReceiptReview } from "./ReceiptReview";

/** Reading animation until the worker is done, then the review form. */
export function ReceiptSheetBody({
	id,
	homeCurrency,
}: {
	id: string;
	homeCurrency: string;
}) {
	const reduce = useReducedMotion();
	const { data: receipt, isError } = useQuery(receiptQuery(id));

	if (isError) {
		return (
			<div className="space-y-4 text-center">
				<p className="text-ink-soft">
					{t("This receipt isn't available any more.")}
				</p>
				<button
					type="button"
					onClick={capture.close}
					className={buttonClass("ink", "md")}
				>
					{t("Close")}
				</button>
			</div>
		);
	}

	if (!receipt || receipt.status === "reading") {
		return (
			<div className="space-y-5 py-2 text-center" aria-live="polite">
				<div className="relative mx-auto h-64 w-44 overflow-hidden rounded-tile border border-line bg-surface-2">
					<img
						src={receiptImageUrl(id)}
						alt=""
						className="size-full object-cover object-top opacity-80"
					/>
					{!reduce && (
						<motion.span
							aria-hidden="true"
							className="absolute inset-x-0 h-14 bg-linear-to-b from-transparent via-marigold/60 to-transparent"
							animate={{ top: ["-15%", "100%"] }}
							transition={{
								repeat: Number.POSITIVE_INFINITY,
								duration: 1.3,
								ease: "easeInOut",
							}}
						/>
					)}
				</div>
				<div>
					<p className="font-display text-[1.4rem] font-bold">
						{t("Reading your receipt…")}
					</p>
					<p className="mx-auto mt-1 max-w-[34ch] text-ink-soft">
						Shop, items, tax and total. You can close this; we'll let you know
						when it's ready.
					</p>
				</div>
				<button
					type="button"
					onClick={capture.openScan}
					className={buttonClass("ghost", "md", "border-2 border-line")}
				>
					{t("Scan another meanwhile")}
				</button>
			</div>
		);
	}

	if (receipt.status === "saved") {
		return (
			<p className="py-6 text-center text-ink-soft">
				{t("This receipt is already saved as an expense.")}
			</p>
		);
	}

	return (
		<ReceiptReview
			key={receipt.id}
			receipt={receipt}
			homeCurrency={homeCurrency}
		/>
	);
}
