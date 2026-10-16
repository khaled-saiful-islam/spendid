import { formatMinor, type Summary } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Moon, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { delightApi, streakQuery } from "@/lib/delight-api";
import { capture } from "../capture/capture-store";

/** After 8pm: "Anything I missed today?" — ten seconds that keep the streak and the numbers honest. */
export function CheckInCard({ summary }: { summary: Summary | undefined }) {
	const queryClient = useQueryClient();
	const { data: streak } = useQuery(streakQuery);
	const [busy, setBusy] = useState(false);
	if (!streak?.checkInDue || !summary) return null;
	const count = summary.today.length;
	const total = summary.today.reduce((s, t) => s + t.homeAmountMinor, 0);

	async function answer(kind: "all-logged" | "nothing") {
		setBusy(true);
		try {
			const next = await delightApi.checkIn(kind);
			queryClient.setQueryData(streakQuery.queryKey, next);
			toast(t("Checked in. {n}-day streak!", { n: next.current }));
		} catch {
			toast(t("Couldn't save. Try again."));
		}
		setBusy(false);
	}

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			aria-labelledby="checkin-title"
			className="relative overflow-hidden rounded-panel bg-linear-to-br from-plum-950 via-plum-800 to-plum-700 p-5 text-white shadow-lift"
		>
			<div
				className="bg-scales pointer-events-none absolute inset-0 opacity-15"
				aria-hidden="true"
			/>
			<h2
				id="checkin-title"
				className="relative flex items-center gap-2 text-[1.35rem] font-bold"
			>
				<Moon className="size-5 text-marigold" aria-hidden="true" />{" "}
				{t("Anything I missed today?")}
			</h2>
			<p data-money className="relative mt-1 text-white/85">
				{count === 0
					? t("Nothing logged today. Was it a no-spend day?")
					: t(
							count === 1
								? "You logged 1 thing, {amount} in all."
								: "You logged {n} things, {amount} in all.",
							{ n: count, amount: formatMinor(total, summary.homeCurrency) },
						)}
			</p>
			<div className="relative mt-4 flex flex-wrap gap-2">
				<button
					type="button"
					disabled={busy}
					onClick={() => void answer(count === 0 ? "nothing" : "all-logged")}
					className={buttonClass("coin", "md")}
				>
					<Check className="size-5" aria-hidden="true" />
					{count === 0 ? t("No spending today") : t("That's everything")}
				</button>
				<button
					type="button"
					onClick={capture.openMenu}
					className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-white/40 px-5 font-semibold hover:bg-white/10"
				>
					<Plus className="size-5" aria-hidden="true" /> {t("Add something")}
				</button>
			</div>
		</motion.section>
	);
}
