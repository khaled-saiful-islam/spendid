import { addDays, formatMinor, type Summary } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cycleDates, shortDay } from "@/lib/period-words";
import { planSetupApi, refreshPlan } from "@/lib/plan-setup-api";
import { appToday } from "@/lib/time";
import { usePlanSheet } from "../plan/PlanSheet";

/** After a cycle ends: the next one Spendid drafted, to confirm or change. */
export function DraftCycleCard({ summary }: { summary: Summary }) {
	const queryClient = useQueryClient();
	const plan = usePlanSheet();
	const reduce = useReducedMotion();
	const [pending, setPending] = useState(false);
	const { period } = summary;
	if (period.kind !== "cycle" || period.status !== "draft") return null;

	async function looksRight() {
		setPending(true);
		try {
			await planSetupApi.confirm();
			await refreshPlan(queryClient);
			toast(t("Your new cycle is set."));
		} catch {
			toast(t("Couldn't save. Try again."));
		}
		setPending(false);
	}

	return (
		<motion.section
			initial={reduce ? false : { opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			aria-labelledby="draft-cycle-title"
			className="rounded-panel border-2 border-marigold/60 bg-surface p-5"
		>
			<h2 id="draft-cycle-title" className="text-[1.15rem] font-bold">
				{t("Your cycle ended on {date}.", {
					date: shortDay(addDays(period.start, -1)),
				})}
			</h2>
			<p className="mt-1 text-ink-soft">
				{t("Next: {dates}, salary {amount}.", {
					dates: cycleDates(period.start, period.end, appToday()),
					amount: formatMinor(summary.incomeMinor ?? 0, summary.homeCurrency),
				})}
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<button
					type="button"
					disabled={pending}
					onClick={() => void looksRight()}
					className={buttonClass("coin", "md")}
				>
					{t("Looks right")}
				</button>
				<button
					type="button"
					onClick={plan.open}
					className={buttonClass("ghost", "md")}
				>
					{t("Change")}
				</button>
			</div>
			{plan.sheet}
		</motion.section>
	);
}
