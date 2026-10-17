import { formatMinor, type Summary } from "@spendid/shared";
import { Link } from "@tanstack/react-router";
import { CountUp } from "@/components/money/CountUp";
import { SafeDial } from "@/components/money/SafeDial";
import { buttonClass } from "@/components/ui/Button";
import { t } from "@/i18n";

/** The heart of Spendid: one number, with the reason behind it in a sentence. */
/** ", after keeping X for savings and Y for 3 bills still due" — or nothing. */
function keptAside(...parts: (string | null)[]): string {
	const kept = parts.filter(Boolean);
	return kept.length
		? t(", after keeping {kept} aside", { kept: kept.join(t(" and ")) })
		: "";
}

export function SafeCard({ summary }: { summary: Summary }) {
	const { safe, homeCurrency: cur, daysLeft, reservedMinor } = summary;
	const money = (m: number) => formatMinor(m, cur);

	if (safe.status === "no-income") {
		return (
			<section className="bg-scales rounded-panel bg-plum-900 p-5 text-plum-50 sm:p-6 dark:bg-plum-800">
				<p className="text-[0.9rem] text-plum-200">
					{t("Safe to spend today")}
				</p>
				<h2 className="mt-1 max-w-[26ch] text-[1.35rem] leading-snug font-bold">
					{t("Add your monthly income to see your daily number.")}
				</h2>
				<Link
					to="/onboarding"
					search={{ edit: true }}
					className={buttonClass("coin", "md", "mt-4")}
				>
					{t("Add income")}
				</Link>
			</section>
		);
	}

	const over = safe.status === "over";
	// The month as a whole is in the red (not just today's share).
	const monthOver = safe.leftThisMonthMinor < 0;
	const tomorrowDays = Math.max(1, daysLeft - 1);
	const tomorrow = Math.max(
		0,
		Math.floor(safe.leftThisMonthMinor / tomorrowDays),
	);

	const reason = monthOver
		? t("Keep today to the essentials. The 1st brings a fresh month.")
		: over
			? t("No stress — tomorrow starts fresh at about {amount}.", {
					amount: money(tomorrow),
				})
			: `${t(daysLeft === 1 ? "{amount} a day for the next day" : "{amount} a day for the next {n} days", { amount: money(safe.dailyAllowanceMinor), n: daysLeft })}${keptAside(
					reservedMinor > 0
						? t("{amount} for savings", { amount: money(reservedMinor) })
						: null,
					summary.bills.minor > 0
						? t(
								summary.bills.items.length === 1
									? "{amount} for a bill still due"
									: "{amount} for {n} bills still due",
								{
									amount: money(summary.bills.minor),
									n: summary.bills.items.length,
								},
							)
						: null,
				)}.`;

	return (
		<section className="bg-scales relative overflow-hidden rounded-panel bg-plum-900 p-5 text-plum-50 sm:p-6 dark:bg-plum-800">
			<div className="flex items-center gap-4">
				<div className="min-w-0 flex-1">
					<p className="text-[0.9rem] font-medium text-plum-200">
						{monthOver
							? t("This month is over budget by")
							: over
								? t("Over today's amount by")
								: t("Safe to spend today")}
					</p>
					<CountUp
						minor={Math.abs(
							monthOver ? safe.leftThisMonthMinor : safe.safeTodayMinor,
						)}
						currency={cur}
						className={`num mt-0.5 block text-[clamp(1.9rem,8vw,2.6rem)] leading-tight font-extrabold ${over ? "text-coral" : "text-marigold"}`}
					/>
				</div>
				<SafeDial
					remainingMinor={Math.max(0, safe.safeTodayMinor)}
					allowanceMinor={safe.dailyAllowanceMinor}
					compact
					className="w-[5.5rem] shrink-0 sm:w-24"
				/>
			</div>
			<p
				data-money
				className="mt-3 border-t border-plum-50/10 pt-3 text-[0.9rem] leading-snug text-plum-200"
			>
				{reason}
			</p>
		</section>
	);
}
