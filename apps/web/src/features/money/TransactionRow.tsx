import { type Category, formatMinor, type Transaction } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { t as tr } from "@/i18n";
import { categoriesQuery } from "@/lib/money-api";
import { formatTime } from "@/lib/time";
import { capture } from "../capture/capture-store";

/** id → category, for rows and charts. */
export function useCategoryMap(): Map<string, Category> {
	const { data = [] } = useQuery(categoriesQuery);
	return new Map(data.map((c) => [c.id, c]));
}

const time = (iso: string) => formatTime(iso);

/** One expense. Tapping opens it for editing. */
export function TransactionRow({
	t,
	category,
	onOpen,
}: {
	t: Transaction;
	category?: Category;
	/** Runs before the edit sheet opens (e.g. to close a sheet this row sits in). */
	onOpen?: () => void;
}) {
	const foreign = t.currency !== t.homeCurrency;
	return (
		<motion.li
			layout
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, x: -40 }}
		>
			<button
				type="button"
				onClick={() => {
					onOpen?.();
					capture.edit(t);
				}}
				className="flex w-full items-center gap-3 rounded-tile px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
			>
				<CategoryIcon icon={category?.icon} tint={category?.tint} />
				<span className="min-w-0 flex-1">
					<span className="block font-semibold break-words">
						{t.merchant ?? category?.name ?? tr("Expense")}
					</span>
					<span className="block text-[0.85rem] text-ink-soft">
						{category?.name ?? tr("Uncategorised")}, {time(t.occurredAt)}
					</span>
				</span>
				<span className="shrink-0 text-right">
					<span className="num block font-bold">
						{formatMinor(-t.homeAmountMinor, t.homeCurrency)}
					</span>
					{foreign && (
						<span className="num block text-[0.8rem] text-ink-soft">
							{formatMinor(t.amountMinor, t.currency)}
						</span>
					)}
				</span>
			</button>
		</motion.li>
	);
}
