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
			<section className="bg-scales rounded-panel bg-plum-900 p-6 text-plum-50 sm:p-8 dark:bg-plum-800">
				<p className="text-plum-200">{t("Safe to spend today")}</p>
				<h2 className="mt-2 max-w-[22ch] text-[1.8rem] font-extrabold">
					{t("Add your monthly income to see your daily number.")}
				</h2>
				<Link
					to="/onboarding"
					search={{ edit: true }}
					className={buttonClass("coin", "md", "mt-5")}
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

	return (
		<section className="bg-scales relative overflow-hidden rounded-panel bg-plum-900 p-6 text-plum-50 sm:p-8 dark:bg-plum-800">
			<div className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
				<div>
					<p className="text-plum-200">
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
						className={`num mt-1 block text-[clamp(3rem,13vw,4.5rem)] leading-none font-extrabold ${over ? "text-coral" : "text-marigold"}`}
					/>
					<p data-money className="mt-3 max-w-[38ch] text-plum-200">
						{monthOver
							? t("Keep today to the essentials. The 1st brings a fresh month.")
							: over
								? t("No stress — tomorrow starts fresh at about {amount}.", {
										amount: money(tomorrow),
									})
								: `${t(daysLeft === 1 ? "{amount} a day for the next day" : "{amount} a day for the next {n} days", { amount: money(safe.dailyAllowanceMinor), n: daysLeft })}${keptAside(
										reservedMinor > 0
											? t("{amount} for savings", {
													amount: money(reservedMinor),
												})
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
									)}.`}
					</p>
				</div>
				<SafeDial
					remainingMinor={Math.max(0, safe.safeTodayMinor)}
					allowanceMinor={safe.dailyAllowanceMinor}
					className="mx-auto w-44"
				/>
			</div>
		</section>
	);
}
