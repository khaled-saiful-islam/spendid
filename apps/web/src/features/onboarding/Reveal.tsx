import { formatMinor, type Summary } from "@spendid/shared";
import { motion, useReducedMotion } from "motion/react";
import { CountUp } from "@/components/money/CountUp";
import { buttonClass } from "@/components/ui/Button";
import { t } from "@/i18n";
import { buzz } from "@/lib/haptics";
import { SpendidCoin } from "../ask/SpendidCoin";

/**
 * The end of setup: the Spendid coin drops into place and today's real number counts up,
 * with the two facts it came from. One moment, made from the person's own answers.
 */
export function Reveal({
	summary,
	name,
	onGo,
}: {
	summary: Summary;
	name: string;
	onGo: () => void;
}) {
	const reduce = useReducedMotion();
	const money = (m: number) => formatMinor(m, summary.homeCurrency);
	const hasIncome = summary.safe.status !== "no-income";
	const first = name.trim().split(/\s+/)[0] ?? "";
	const facts = hasIncome
		? [
				summary.reservedMinor > 0
					? t("{amount} kept aside for savings first", {
							amount: money(summary.reservedMinor),
						})
					: null,
				summary.bills.minor > 0
					? t("{amount} kept aside for bills still due", {
							amount: money(summary.bills.minor),
						})
					: null,
				t("Shared over the {n} days left this month", { n: summary.daysLeft }),
				t("It updates every time you spend"),
			].filter((f): f is string => f !== null)
		: [t("Add your monthly income any time to get your daily number.")];
	const step = (i: number) => (reduce ? 0 : 1.5 + i * 0.25);

	return (
		<div className="bg-scales fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-plum-950 px-4 py-10 text-plum-50">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-[60dvh] bg-[radial-gradient(60%_50%_at_50%_30%,rgb(255_178_36/0.28),transparent_70%)]"
			/>
			<div
				className="relative mx-auto w-full max-w-md text-center"
				role="status"
				aria-live="polite"
			>
				<motion.div
					className="mx-auto w-fit"
					initial={reduce ? false : { y: -220, rotate: -180, opacity: 0 }}
					animate={{ y: 0, rotate: 0, opacity: 1 }}
					transition={{
						type: "spring",
						stiffness: 140,
						damping: 12,
						mass: 1.1,
					}}
					onAnimationComplete={() => buzz("success")}
				>
					<SpendidCoin size="lg" state="idle" className="size-24!" />
				</motion.div>
				<motion.p
					className="mt-6 font-semibold text-plum-200"
					initial={reduce ? false : { opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: reduce ? 0 : 0.9 }}
				>
					{first
						? t("{name}, today you can safely spend", { name: first })
						: t("Today you can safely spend")}
				</motion.p>
				<motion.p
					className="num mt-2 font-display text-[clamp(3rem,15vw,4.6rem)] leading-none font-extrabold text-marigold"
					initial={reduce ? false : { opacity: 0, scale: 0.8 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{
						delay: reduce ? 0 : 1,
						type: "spring",
						stiffness: 200,
						damping: 16,
					}}
				>
					{hasIncome ? (
						<CountUp
							minor={Math.max(0, summary.safe.safeTodayMinor)}
							currency={summary.homeCurrency}
						/>
					) : (
						"–"
					)}
				</motion.p>
				<ul className="mx-auto mt-8 max-w-[34ch] space-y-2.5 text-left">
					{facts.map((f, i) => (
						<motion.li
							key={f}
							className="flex items-start gap-3 text-plum-100"
							initial={reduce ? false : { opacity: 0, x: -12 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: step(i) }}
						>
							<span
								className="mt-2 size-2 shrink-0 rounded-full bg-marigold"
								aria-hidden="true"
							/>
							{f}
						</motion.li>
					))}
				</ul>
				<motion.div
					initial={reduce ? false : { opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: step(facts.length) }}
				>
					<button
						type="button"
						onClick={onGo}
						className={buttonClass("coin", "lg", "mt-10 w-full")}
						data-autofocus
					>
						{t("Let's go")}
					</button>
				</motion.div>
			</div>
		</div>
	);
}
