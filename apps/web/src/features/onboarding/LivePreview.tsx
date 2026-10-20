import {
	type BudgetMethod,
	formatMinor,
	reservedSavings,
} from "@spendid/shared";
import {
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "motion/react";
import { useEffect } from "react";
import { t } from "@/i18n";
import { transferFill } from "../plan/Transfers";
import { METHODS } from "./options";

interface PreviewProps {
	name: string;
	currency: string;
	/** Monthly income in minor units, or null while it's empty. */
	incomeMinor: number | null;
	method: BudgetMethod | null;
	step: number;
	/** Pay yourself first: the transfers typed so far. */
	transfers?: { name: string; amountMinor: number }[];
}

interface PreviewBar {
	key: string;
	label: string;
	color: string;
	share: number;
	minor: number;
}

/** The style's example split, or for pay yourself first the real transfers and what's left. */
function barsFor(
	method: BudgetMethod | null,
	income: number,
	transfers: { name: string; amountMinor: number }[],
): PreviewBar[] {
	// No plan yet: all of it is simply there to spend.
	if (method === null)
		return [
			{
				key: "spend",
				label: t("To spend"),
				color: "bg-jade",
				share: 100,
				minor: income,
			},
		];
	if (method !== "pay_yourself_first") {
		const style = METHODS.find((m) => m.id === method) ?? METHODS[0];
		return (style?.bars ?? []).map((b) => ({
			key: b.label,
			...b,
			minor: Math.round((income * b.share) / 100),
		}));
	}
	const sent = transfers.reduce((s, x) => s + x.amountMinor, 0);
	const whole = Math.max(income, sent, 1);
	const rest = Math.max(0, income - sent);
	return [
		...transfers.map((x, i) => ({
			key: `${i}-${x.name}`,
			label: x.name,
			color: transferFill(i),
			share: (x.amountMinor / whole) * 100,
			minor: x.amountMinor,
		})),
		{
			key: "spend",
			label: t("To spend"),
			color: "bg-jade",
			share: (rest / whole) * 100,
			minor: rest,
		},
	];
}

/** A number that glides to its new value as the person types. */
function Glide({ minor, currency }: { minor: number; currency: string }) {
	const reduce = useReducedMotion();
	const value = useMotionValue(minor);
	const text = useTransform(value, (v) => formatMinor(Math.round(v), currency));
	useEffect(() => {
		if (reduce) value.set(minor);
		else void animate(value, minor, { duration: 0.5, ease: "easeOut" });
	}, [minor, reduce, value]);
	return <motion.span>{text}</motion.span>;
}

const daysInThisMonth = () => {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
};

/**
 * "Your month, sorted": the pay typed so far pours into the budget style's jars, with a rough
 * daily amount. Real numbers from the answers, never placeholders dressed up as data.
 */
export function LivePreview({
	name,
	currency,
	incomeMinor,
	method,
	step,
	transfers = [],
}: PreviewProps) {
	const reduce = useReducedMotion();
	const income = incomeMinor ?? 0;
	const bars = barsFor(method, income, transfers);
	const payFirst = method === "pay_yourself_first";
	const kept = reservedSavings({
		incomeMinor,
		method,
		goalsMonthlyMinor: 0,
		transfersMinor: transfers.reduce((s, x) => s + x.amountMinor, 0),
	});
	const daily =
		income > 0 ? Math.floor((income - kept) / daysInThisMonth()) : 0;
	const first = name.trim().split(/\s+/)[0] ?? "";

	return (
		<section
			aria-label={t("Your month, sorted")}
			className="relative overflow-hidden rounded-panel border border-white/10 bg-white/6 p-5 text-plum-50 backdrop-blur-md sm:p-6"
		>
			<p className="font-semibold text-plum-200">
				{first
					? t("{name}'s month, sorted", { name: first })
					: t("Your month, sorted")}
			</p>

			<p className="num mt-2 font-display text-[clamp(2.2rem,8vw,3rem)] leading-none font-extrabold text-marigold">
				{income > 0 ? (
					<Glide minor={income} currency={currency} />
				) : (
					formatMinor(0, currency)
				)}
			</p>
			<p className="mt-1 text-[0.92rem] text-plum-200">
				{income > 0
					? t("comes in each month")
					: step >= 1
						? t("Type your pay to see it sorted")
						: t("Your pay goes here next")}
			</p>

			<div className="mt-5 flex h-14 w-full gap-[3px]" aria-hidden="true">
				{bars.map((b, i) => (
					<motion.div
						key={`${method}-${b.key}`}
						className={`${b.color} flex h-full items-end overflow-hidden rounded-xl`}
						initial={reduce ? false : { width: 0, opacity: 0 }}
						animate={{
							width: `${b.share}%`,
							opacity: income > 0 || step >= 2 ? 1 : 0.35,
						}}
						transition={{
							delay: i * 0.08,
							type: "spring",
							stiffness: 160,
							damping: 20,
						}}
					>
						<motion.span
							className="block w-full bg-white/25"
							initial={false}
							animate={{ height: income > 0 ? "100%" : "18%" }}
							transition={{
								delay: 0.2 + i * 0.1,
								duration: 0.7,
								ease: "easeOut",
							}}
						/>
					</motion.div>
				))}
			</div>
			<ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.9rem] sm:grid-cols-3">
				{bars.map((b) => (
					<li key={b.key} className="flex items-start gap-2">
						<span
							className={`${b.color} mt-1.5 size-2.5 shrink-0 rounded-full`}
							aria-hidden="true"
						/>
						<span>
							<span className="block break-words text-plum-100">{b.label}</span>
							<span className="num block font-bold">
								{income > 0 ? (
									<Glide minor={b.minor} currency={currency} />
								) : (
									"–"
								)}
							</span>
						</span>
					</li>
				))}
			</ul>

			<div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 border-t border-white/12 pt-4">
				<span className="text-plum-100">
					{kept > 0
						? payFirst
							? t("Sent out first")
							: t("Kept aside for savings first")
						: t("Daily amount")}
				</span>
				<span className="num font-display text-[1.4rem] font-extrabold">
					{income > 0 ? (
						kept > 0 ? (
							<Glide minor={kept} currency={currency} />
						) : (
							<>
								<Glide minor={daily} currency={currency} />
								<span className="text-[0.9rem] font-semibold text-plum-200">
									{" "}
									{t("a day")}
								</span>
							</>
						)
					) : (
						"–"
					)}
				</span>
			</div>
			{income > 0 && kept > 0 && (
				<p className="mt-1 text-right text-[0.9rem] text-plum-200">
					{t("then about {amount} a day", {
						amount: formatMinor(daily, currency),
					})}
				</p>
			)}
		</section>
	);
}
