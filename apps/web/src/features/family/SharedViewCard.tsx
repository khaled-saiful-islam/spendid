import { formatMinor, LEVEL_INFO, type SharedView } from "@spendid/shared";
import {
	EyeOff,
	PauseCircle,
	ReceiptText,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { CategoryIcon, TINTS } from "@/components/money/CategoryIcon";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { receiptImageUrl } from "@/lib/family-api";
import { formatMoment } from "@/lib/time";

const day = (iso: string) =>
	formatMoment(iso, {
		weekday: "short",
		day: "numeric",
		month: "short",
	});

function Month({ view }: { view: SharedView }) {
	const m = view.month;
	if (!m) return null;
	const diff = m.spentMinor - m.lastMonthMinor;
	const Trend = diff > 0 ? TrendingUp : TrendingDown;
	return (
		<div>
			<p className="text-ink-soft">{t("Spent this month")}</p>
			<p className="num mt-1 text-[clamp(2.2rem,9vw,3rem)] leading-none font-extrabold">
				{formatMinor(m.spentMinor, view.currency)}
			</p>
			<p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.92rem] text-ink-soft">
				<span>
					{m.count === 1 ? t("1 expense") : t("{n} expenses", { n: m.count })}
				</span>
				{m.lastMonthMinor > 0 && (
					<span className="inline-flex items-center gap-1">
						<Trend className="size-4 shrink-0" aria-hidden="true" />
						{t(
							diff > 0
								? "{amount} more than all of last month"
								: "{amount} less than all of last month",
							{
								amount: formatMinor(Math.abs(diff), view.currency),
							},
						)}
					</span>
				)}
			</p>
		</div>
	);
}

function Categories({ view }: { view: SharedView }) {
	const reduce = useReducedMotion();
	const list = view.categories;
	if (!list) return null;
	if (list.length === 0)
		return <p className="text-ink-soft">{t("No spending this month yet.")}</p>;
	const max = Math.max(...list.map((c) => c.spentMinor), 1);
	return (
		<ul className="space-y-3">
			{list.map((c, i) => (
				<li key={c.name} className="flex items-center gap-3">
					<CategoryIcon icon={c.icon} tint={c.tint} size="sm" />
					<span className="min-w-0 flex-1">
						<span className="flex flex-wrap justify-between gap-x-3">
							<span className="font-semibold break-words">{t(c.name)}</span>
							<span className="num font-semibold">
								{formatMinor(c.spentMinor, view.currency)}
							</span>
						</span>
						<span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface-2">
							<motion.span
								className={cn(
									"block h-full rounded-full bg-linear-to-r",
									TINTS[c.tint] ?? TINTS.slate,
								)}
								initial={{
									width: reduce ? `${(c.spentMinor / max) * 100}%` : 0,
								}}
								animate={{ width: `${(c.spentMinor / max) * 100}%` }}
								transition={{
									delay: i * 0.05,
									type: "spring",
									stiffness: 80,
									damping: 18,
								}}
							/>
						</span>
					</span>
				</li>
			))}
		</ul>
	);
}

function Expenses({
	view,
	ownerId,
}: {
	view: SharedView;
	ownerId: string | null;
}) {
	const [receipt, setReceipt] = useState<string | null>(null);
	const list = view.expenses;
	if (!list) return null;
	if (list.length === 0)
		return <p className="text-ink-soft">{t("No expenses yet.")}</p>;
	return (
		<>
			<ul className="divide-y divide-line">
				{list.map((e) => (
					<li key={e.id} className="flex items-center gap-3 py-2.5">
						<CategoryIcon icon={e.icon} tint={e.tint} />
						<span className="min-w-0 flex-1">
							<span className="block font-semibold break-words">
								{e.merchant ?? t(e.category)}
							</span>
							<span className="block text-[0.85rem] text-ink-soft">
								{t(e.category)}, {day(e.occurredAt)}
							</span>
						</span>
						{e.receiptId && ownerId && (
							<button
								type="button"
								onClick={() => setReceipt(e.receiptId)}
								className="grid size-10 shrink-0 place-items-center rounded-full text-plum-500 hover:bg-surface-2"
								aria-label={t("See the receipt for {name}", {
									name: e.merchant ?? e.category,
								})}
							>
								<ReceiptText className="size-5" aria-hidden="true" />
							</button>
						)}
						{e.receiptId && !ownerId && (
							<ReceiptText
								className="size-5 shrink-0 text-plum-500"
								aria-label={t("Receipt shared")}
							/>
						)}
						<span className="num shrink-0 font-bold">
							{formatMinor(-e.amountMinor, view.currency)}
						</span>
					</li>
				))}
			</ul>
			<Sheet
				open={receipt !== null}
				onClose={() => setReceipt(null)}
				title={t("Receipt")}
			>
				{receipt && ownerId && (
					<img
						src={receiptImageUrl(ownerId, receipt)}
						alt={t("Receipt for this expense")}
						className="mx-auto max-h-[70dvh] rounded-tile"
					/>
				)}
			</Sheet>
		</>
	);
}

/**
 * One person's money exactly as a grant allows. Used for "what they share with me" and,
 * unchanged, for "what they see of mine" — so the preview is the real thing.
 * `ownerId` enables receipt photos (viewer side only).
 */
export function SharedViewCard({
	view,
	ownerId,
}: {
	view: SharedView;
	ownerId: string | null;
}) {
	if (view.paused)
		return (
			<div className="flex items-start gap-3 rounded-panel border-2 border-dashed border-line p-5">
				<PauseCircle
					className="size-7 shrink-0 text-ink-soft"
					aria-hidden="true"
				/>
				<p className="text-ink-soft">
					{t(
						"Sharing is paused, so nothing is visible right now. It comes back the moment it's turned on again.",
					)}
				</p>
			</div>
		);
	if (view.level === "none")
		return (
			<div className="flex items-start gap-3 rounded-panel border-2 border-dashed border-line p-5">
				<EyeOff className="size-7 shrink-0 text-ink-soft" aria-hidden="true" />
				<p className="text-ink-soft">
					{t(
						"{name} shares nothing about their spending with you. You're still in each other's circle, and can save in family jars together.",
						{ name: view.ownerName.split(/\s+/)[0] ?? view.ownerName },
					)}
				</p>
			</div>
		);
	return (
		<div className="space-y-6">
			<span className="inline-flex rounded-full bg-plum-500/10 px-3 py-1 text-[0.85rem] font-semibold text-plum-700 dark:text-plum-200">
				{t(LEVEL_INFO[view.level].label)}
			</span>
			<Month view={view} />
			{view.categories && (
				<section className="space-y-3">
					<h3 className="text-[1.15rem] font-bold">{t("By category")}</h3>
					<Categories view={view} />
				</section>
			)}
			{view.expenses && (
				<section className="space-y-1">
					<h3 className="text-[1.15rem] font-bold">{t("Latest expenses")}</h3>
					<Expenses view={view} ownerId={ownerId} />
				</section>
			)}
		</div>
	);
}
