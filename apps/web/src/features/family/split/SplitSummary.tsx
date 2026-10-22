import { formatMinor, type SplitDto } from "@spendid/shared";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { Avatar } from "../parts";

/**
 * Who owes what for one bill. The owner can tick people off as paid; the split link shows
 * the same thing read-only.
 */
export function SplitSummary({
	split,
	onTogglePaid,
}: {
	split: SplitDto;
	onTogglePaid?: (key: string, paid: boolean) => void;
}) {
	const nameOf = new Map(split.people.map((p) => [p.key, p.name]));
	const seedOf = new Map(split.people.map((p) => [p.key, p.userId ?? p.key]));
	return (
		<div className="space-y-6">
			<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{split.result.shares.map((s, i) => {
					const paid = split.paid.includes(s.key);
					return (
						<motion.li
							key={s.key}
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: i * 0.06 }}
							className={cn(
								"flex items-center gap-3 rounded-panel border-2 p-4 transition-colors",
								paid ? "border-jade bg-jade/8" : "border-line bg-surface",
							)}
						>
							<Avatar name={s.name} seed={seedOf.get(s.key) ?? s.key} />
							<span className="min-w-0 flex-1">
								<span className="block font-bold break-words">{s.name}</span>
								<span className="block text-[0.85rem] text-ink-soft">
									<span className="whitespace-nowrap">
										{formatMinor(s.itemsMinor, split.currency)}
									</span>{" "}
									{t("items")}
									{s.adjustMinor !== 0 && (
										<>
											,{" "}
											<span className="whitespace-nowrap">
												{s.adjustMinor > 0 ? "+" : "−"}
												{formatMinor(Math.abs(s.adjustMinor), split.currency)}
											</span>{" "}
											{s.adjustMinor > 0 ? t("tax & service") : t("discount")}
										</>
									)}
								</span>
							</span>
							<span className="shrink-0 text-right">
								<span className="num block text-[1.3rem] font-extrabold">
									{formatMinor(s.totalMinor, split.currency)}
								</span>
								{onTogglePaid ? (
									<button
										type="button"
										aria-pressed={paid}
										onClick={() => onTogglePaid(s.key, !paid)}
										className={cn(
											"mt-1 inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[0.85rem] font-semibold",
											paid
												? "bg-jade text-white"
												: "bg-surface-2 text-ink-soft hover:text-ink",
										)}
									>
										{paid && <Check className="size-4" aria-hidden="true" />}
										{paid ? t("Paid") : t("Mark paid")}
									</button>
								) : (
									paid && (
										<span className="mt-1 inline-flex items-center gap-1 rounded-full bg-jade px-3 py-1 text-[0.85rem] font-semibold text-white">
											<Check className="size-4" aria-hidden="true" />{" "}
											{t("Paid")}
										</span>
									)
								)}
							</span>
						</motion.li>
					);
				})}
			</ul>
			<details className="rounded-panel border border-line bg-surface p-4">
				<summary className="cursor-pointer font-semibold">
					{t(
						split.items.length === 1
							? "1 item, total {amount}"
							: "{n} items, total {amount}",
						{
							n: split.items.length,
							amount: formatMinor(split.result.totalMinor, split.currency),
						},
					)}
				</summary>
				<ul className="mt-3 divide-y divide-line">
					{split.items.map((item) => (
						<li
							key={item.key}
							className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
						>
							<span className="min-w-0">
								<span className="font-semibold break-words">{item.name}</span>
								<span className="block text-[0.85rem] text-ink-soft">
									{item.people.map((k) => nameOf.get(k) ?? "?").join(", ")}
								</span>
							</span>
							<span className="num font-semibold">
								{formatMinor(item.amountMinor, split.currency)}
							</span>
						</li>
					))}
					{split.adjustMinor !== 0 && (
						<li className="flex justify-between gap-4 py-2 text-ink-soft">
							<span>
								{split.adjustMinor > 0
									? t("Tax, service and tip")
									: t("Discount")}
							</span>
							<span className="num font-semibold">
								{formatMinor(split.adjustMinor, split.currency)}
							</span>
						</li>
					)}
				</ul>
			</details>
		</div>
	);
}
