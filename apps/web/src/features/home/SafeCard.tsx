import { formatMinor, type Summary } from "@spendid/shared";
import { Link } from "@tanstack/react-router";
import { CountUp } from "@/components/money/CountUp";
import { SafeDial } from "@/components/money/SafeDial";
import { buttonClass } from "@/components/ui/Button";

/** The heart of Spendid: one number, with the reason behind it in a sentence. */
export function SafeCard({ summary }: { summary: Summary }) {
	const { safe, homeCurrency: cur, daysLeft, reservedMinor } = summary;
	const money = (m: number) => formatMinor(m, cur);

	if (safe.status === "no-income") {
		return (
			<section className="bg-scales rounded-panel bg-plum-900 p-6 text-plum-50 sm:p-8 dark:bg-plum-800">
				<p className="text-plum-200">Safe to spend today</p>
				<h2 className="mt-2 max-w-[22ch] text-[1.8rem] font-extrabold">
					Add your monthly income to see your daily number.
				</h2>
				<Link
					to="/onboarding"
					search={{ edit: true }}
					className={buttonClass("coin", "md", "mt-5")}
				>
					Add income
				</Link>
			</section>
		);
	}

	const over = safe.status === "over";
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
						{over ? "Over today's amount by" : "Safe to spend today"}
					</p>
					<CountUp
						minor={Math.abs(safe.safeTodayMinor)}
						currency={cur}
						className={`num mt-1 block text-[clamp(3rem,13vw,4.5rem)] leading-none font-extrabold ${over ? "text-coral" : "text-marigold"}`}
					/>
					<p className="mt-3 max-w-[38ch] text-plum-200">
						{over
							? `No stress — tomorrow starts fresh at about ${money(tomorrow)}.`
							: `${money(safe.dailyAllowanceMinor)} a day for the next ${daysLeft} ${daysLeft === 1 ? "day" : "days"}${
									reservedMinor > 0
										? `, after keeping ${money(reservedMinor)} aside for savings`
										: ""
								}.`}
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
