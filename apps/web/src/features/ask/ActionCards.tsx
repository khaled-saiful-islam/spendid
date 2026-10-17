import {
	type AskAction,
	formatMinor,
	hoursOfWork,
	WISH_COOLDOWN_HOURS,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Hourglass, Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { buttonClass } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { dateLocale, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { delightApi } from "@/lib/delight-api";
import { buzz } from "@/lib/haptics";
import { ApiError } from "@/lib/http";
import {
	categoriesQuery,
	moneyApi,
	refreshMoney,
	summaryQuery,
} from "@/lib/money-api";
import { GoalJar } from "../plan/GoalJar";

export type ActionStatus = "ready" | "done" | "dismissed";
export interface ActionItem {
	action: AskAction;
	status: ActionStatus;
}

interface CardsProps {
	items: ActionItem[];
	onResolve: (index: number, status: ActionStatus) => void;
}

/** What the assistant prepared, one card each. Nothing exists until the person confirms. */
export function ActionCards({ items, onResolve }: CardsProps) {
	return (
		<div className="space-y-3">
			{items.map((item, i) =>
				item.status === "dismissed" ? null : (
					<ActionCard
						// Cards never reorder; the index is their identity within one answer.
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed list per answer
						key={i}
						item={item}
						onResolve={(s) => onResolve(i, s)}
					/>
				),
			)}
		</div>
	);
}

function ActionCard({
	item,
	onResolve,
}: {
	item: ActionItem;
	onResolve: (s: ActionStatus) => void;
}) {
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { action } = item;
	const done = item.status === "done";

	async function confirm() {
		setPending(true);
		setError(null);
		try {
			await run(action);
			await refreshMoney(queryClient);
			await queryClient.invalidateQueries({ queryKey: ["wishes"] });
			buzz("success");
			toast(doneMessage(action));
			onResolve("done");
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : t("Couldn't save. Try again."),
			);
		} finally {
			setPending(false);
		}
	}

	const body =
		action.kind === "goal" ? (
			<GoalBody action={action} done={done} />
		) : action.kind === "deposit" ? (
			<DepositBody action={action} done={done} />
		) : action.kind === "budget" ? (
			<BudgetBody action={action} />
		) : (
			<WishBody action={action} />
		);

	return (
		<motion.section
			initial={{ opacity: 0, y: 14, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{ type: "spring", stiffness: 220, damping: 22 }}
			className={cn(
				"relative overflow-hidden rounded-panel border bg-surface p-4 shadow-lift",
				done ? "border-jade/50" : "border-line",
			)}
			aria-label={cardTitle(action)}
		>
			<p className="text-[0.85rem] font-semibold text-ink-soft">
				{cardTitle(action)}
			</p>
			<div className="mt-2">{body}</div>
			<AnimatePresence mode="wait" initial={false}>
				{done ? (
					<motion.div
						key="done"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2"
					>
						<span className="inline-flex items-center gap-1.5 rounded-full bg-jade/12 px-3 py-1.5 font-semibold text-safe">
							<Check className="size-4" aria-hidden="true" />
							{doneMessage(action)}
						</span>
						<Link
							to="/app/plan"
							className="font-semibold underline decoration-marigold decoration-2 underline-offset-4"
						>
							{t("See it in your plan")}
						</Link>
					</motion.div>
				) : (
					<motion.div
						key="ask"
						exit={{ opacity: 0 }}
						className="mt-4 space-y-2"
					>
						{error && (
							<p role="alert" className="text-[0.9rem] font-medium text-coral">
								{error}
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								onClick={confirm}
								disabled={pending}
								className={buttonClass("coin", "md")}
							>
								{pending && (
									<Loader2 className="size-4 animate-spin" aria-hidden="true" />
								)}
								{confirmLabel(action)}
							</button>
							<button
								type="button"
								onClick={() => onResolve("dismissed")}
								disabled={pending}
								className={buttonClass("ghost", "md")}
							>
								{t("Not now")}
							</button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.section>
	);
}

/** Calls the normal API for the action, so every rule and limit applies as if typed by hand. */
async function run(action: AskAction): Promise<void> {
	if (action.kind === "goal") {
		await moneyApi.createGoal({
			name: action.name,
			emoji: action.emoji,
			targetMinor: action.targetMinor,
			targetDate: action.targetDate,
		});
	} else if (action.kind === "deposit") {
		await moneyApi.depositGoal(action.goalId, action.amountMinor);
	} else if (action.kind === "budget") {
		await moneyApi.setBudget({
			categoryId: action.categoryId,
			monthlyLimitMinor: action.limitMinor,
		});
	} else {
		await delightApi.addWish({
			name: action.name,
			priceMinor: action.priceMinor,
			currency: action.currency,
		});
	}
}

function cardTitle(a: AskAction): string {
	if (a.kind === "goal") return t("New savings goal");
	if (a.kind === "deposit")
		return a.amountMinor > 0 ? t("Add to a goal") : t("Take out of a goal");
	if (a.kind === "budget") return t("Monthly limit");
	return t("Impulse pause");
}

function confirmLabel(a: AskAction): string {
	const money = (m: number) => formatMinor(Math.abs(m), a.currency);
	if (a.kind === "goal") return t("Create goal");
	if (a.kind === "deposit")
		return a.amountMinor > 0
			? t("Add {amount}", { amount: money(a.amountMinor) })
			: t("Take out {amount}", { amount: money(a.amountMinor) });
	if (a.kind === "budget") return t("Set limit");
	return t("Start the {n}-hour wait", { n: WISH_COOLDOWN_HOURS });
}

function doneMessage(a: AskAction): string {
	if (a.kind === "goal") return t("New goal: {name}.", { name: a.name });
	if (a.kind === "deposit")
		return a.amountMinor > 0
			? t("Added {amount} to {name}.", {
					amount: formatMinor(a.amountMinor, a.currency),
					name: a.goalName,
				})
			: t("Took {amount} out of {name}.", {
					amount: formatMinor(-a.amountMinor, a.currency),
					name: a.goalName,
				});
	if (a.kind === "budget")
		return t("Limit set for {name}.", { name: t(a.categoryName) });
	return t("{name} is waiting. Decide in {n} hours.", {
		name: a.name,
		n: WISH_COOLDOWN_HOURS,
	});
}

function Row({ visual, children }: { visual: ReactNode; children: ReactNode }) {
	return (
		<div className="flex items-center gap-4">
			<div className="shrink-0">{visual}</div>
			<div className="min-w-0 flex-1 space-y-1">{children}</div>
		</div>
	);
}

function GoalBody({
	action,
	done,
}: {
	action: Extract<AskAction, { kind: "goal" }>;
	done: boolean;
}) {
	const money = (m: number) => formatMinor(m, action.currency);
	const months = action.targetDate ? monthsUntil(action.targetDate) : null;
	return (
		<Row
			visual={
				<GoalJar
					ratio={done ? 0.08 : 0}
					emoji={action.emoji}
					className="h-20 w-16"
				/>
			}
		>
			<p className="font-display text-[1.3rem] font-bold break-words">
				{action.name}
			</p>
			<p className="num font-semibold">{money(action.targetMinor)}</p>
			<p className="text-[0.92rem] text-ink-soft">
				{action.targetDate && months
					? t("{amount} a month to make it by {date}.", {
							amount: money(Math.ceil(action.targetMinor / months)),
							date: new Date(`${action.targetDate}T12:00`).toLocaleDateString(
								dateLocale(),
								{ month: "short", year: "numeric" },
							),
						})
					: t("No deadline. Add whenever you like.")}
			</p>
		</Row>
	);
}

function DepositBody({
	action,
	done,
}: {
	action: Extract<AskAction, { kind: "deposit" }>;
	done: boolean;
}) {
	const money = (m: number) => formatMinor(m, action.currency);
	const after = Math.max(0, action.savedMinor + action.amountMinor);
	const ratio = (n: number) =>
		action.targetMinor > 0 ? n / action.targetMinor : 0;
	return (
		<Row
			visual={
				<GoalJar
					ratio={ratio(done ? after : action.savedMinor)}
					emoji={action.emoji}
					className="h-20 w-16"
				/>
			}
		>
			<p className="font-display text-[1.3rem] font-bold break-words">
				{action.goalName}
			</p>
			<p className="num">
				<span className="text-ink-soft">{money(action.savedMinor)}</span>
				{" → "}
				<strong>{money(after)}</strong>
			</p>
			<p className="text-[0.92rem] text-ink-soft">
				{t("{pct}% of {amount}", {
					pct: Math.min(100, Math.round(ratio(after) * 100)),
					amount: money(action.targetMinor),
				})}
			</p>
		</Row>
	);
}

function BudgetBody({
	action,
}: {
	action: Extract<AskAction, { kind: "budget" }>;
}) {
	const { data: categories = [] } = useQuery(categoriesQuery);
	const reduce = useReducedMotion();
	const cat = categories.find((c) => c.id === action.categoryId);
	const money = (m: number) => formatMinor(m, action.currency);
	const share =
		action.limitMinor > 0
			? Math.min(1, action.spentMinor / action.limitMinor)
			: 1;
	const over = action.spentMinor > action.limitMinor;
	return (
		<Row visual={<CategoryIcon icon={cat?.icon} tint={cat?.tint} size="lg" />}>
			<p className="font-display text-[1.3rem] font-bold break-words">
				{t(action.categoryName)}
			</p>
			<p className="num font-semibold">
				{t("{amount} a month", { amount: money(action.limitMinor) })}
			</p>
			<div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
				<motion.div
					className={cn("h-full rounded-full", over ? "bg-coral" : "bg-jade")}
					initial={{ width: reduce ? `${share * 100}%` : 0 }}
					animate={{ width: `${share * 100}%` }}
					transition={{ duration: 0.8, ease: "easeOut" }}
				/>
			</div>
			<p className="text-[0.92rem] text-ink-soft">
				{over
					? t("Already {amount} spent this month, over this limit.", {
							amount: money(action.spentMinor),
						})
					: t("{spent} spent this month, {left} left.", {
							spent: money(action.spentMinor),
							left: money(action.limitMinor - action.spentMinor),
						})}
			</p>
		</Row>
	);
}

function WishBody({
	action,
}: {
	action: Extract<AskAction, { kind: "wish" }>;
}) {
	const { data: summary } = useQuery(summaryQuery);
	const hours = hoursOfWork(action.priceMinor, summary?.incomeMinor ?? null);
	return (
		<Row
			visual={
				<span className="grid size-16 place-items-center rounded-full bg-marigold/20 text-marigold-deep">
					<Hourglass className="size-8" aria-hidden="true" />
				</span>
			}
		>
			<p className="font-display text-[1.3rem] font-bold break-words">
				{action.name}
			</p>
			<p className="num font-semibold">
				{formatMinor(action.priceMinor, action.currency)}
			</p>
			<p className="text-[0.92rem] text-ink-soft">
				{hours !== null
					? t("About {n} hours of work. Wait {h} hours; most urges pass.", {
							n: hours,
							h: WISH_COOLDOWN_HOURS,
						})
					: t("Wait {h} hours; most urges pass.", { h: WISH_COOLDOWN_HOURS })}
			</p>
		</Row>
	);
}

/** Whole months from now until a YYYY-MM-DD date, at least 1. */
function monthsUntil(date: string): number {
	const end = new Date(`${date}T12:00`);
	const now = new Date();
	const months =
		(end.getFullYear() - now.getFullYear()) * 12 +
		end.getMonth() -
		now.getMonth();
	return Math.max(1, months);
}
