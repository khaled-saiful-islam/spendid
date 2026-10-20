import { formatMinor, type Goal, parseAmount, toMinor } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { Plus, Target } from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/http";
import { moneyApi, refreshMoney } from "@/lib/money-api";
import { formatDay } from "@/lib/time";
import { currencySymbol } from "../onboarding/options";
import { GoalJar } from "./GoalJar";
import { goalTint } from "./goal-tint";

const EMOJIS = ["🎯", "🏝️", "🏠", "🚗", "🎓", "💍", "☂️", "🎁"];

function cheer() {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	void confetti({
		particleCount: 140,
		spread: 90,
		origin: { y: 0.6 },
		colors: ["#FFB224", "#12B886", "#7A4FC4"],
	});
}

/** Progress with quarter marks, so a step like "past halfway" is easy to see. */
function MilestoneBar({ ratio, tint }: { ratio: number; tint: string }) {
	return (
		<span className="relative mt-2 block h-2.5 overflow-hidden rounded-full bg-ink/10">
			<motion.span
				className={cn("block h-full rounded-full bg-linear-to-r", tint)}
				initial={{ width: 0 }}
				animate={{ width: `${ratio * 100}%` }}
				transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
			/>
			{[25, 50, 75].map((m) => (
				<span
					key={m}
					aria-hidden="true"
					className="absolute inset-y-0 w-0.5 bg-surface/80"
					style={{ left: `${m}%` }}
				/>
			))}
		</span>
	);
}

function untilLabel(goal: Goal, cur: string): string {
	if (goal.savedMinor >= goal.targetMinor) return t("Done! Time to enjoy it.");
	if (!goal.targetDate) return t("No deadline. Add whenever you like.");
	const when = formatDay(goal.targetDate, { month: "short", year: "numeric" });
	return t("{amount} a month to make it by {date}.", {
		amount: formatMinor(goal.monthlyNeededMinor, cur),
		date: when,
	});
}

function DepositForm({
	goal,
	cur,
	onDone,
}: {
	goal: Goal;
	cur: string;
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	const [value, setValue] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string>();
	const quick = [50, 100, 500];

	async function add(amount: number) {
		if (!(amount > 0)) return setError(t("Enter an amount above zero."));
		setError(undefined);
		setPending(true);
		try {
			const updated = await moneyApi.depositGoal(goal.id, toMinor(amount, cur));
			await refreshMoney(queryClient);
			if (
				updated.savedMinor >= updated.targetMinor &&
				goal.savedMinor < goal.targetMinor
			)
				cheer();
			toast(
				t("Added {amount} to {name}.", {
					amount: formatMinor(toMinor(amount, cur), cur),
					name: goal.name,
				}),
			);
			onDone();
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : t("Couldn't save. Try again."),
			);
		} finally {
			setPending(false);
		}
	}

	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				void add(parseAmount(value));
			}}
		>
			<div className="flex flex-wrap gap-2">
				{quick.map((q) => (
					<button
						key={q}
						type="button"
						onClick={() => void add(q)}
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						+{formatMinor(toMinor(q, cur), cur)}
					</button>
				))}
			</div>
			<Field
				label={t("Or another amount")}
				inputMode="decimal"
				data-autofocus
				adornment={currencySymbol(cur)}
				value={value}
				error={error}
				onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
			/>
			<SubmitButton pending={pending}>
				{t("Add to {name}", { name: goal.name })}
			</SubmitButton>
		</form>
	);
}

function NewGoalForm({ cur, onDone }: { cur: string; onDone: () => void }) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [emoji, setEmoji] = useState("🎯");
	const [target, setTarget] = useState("");
	const [date, setDate] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		const n = parseAmount(target);
		if (!name.trim()) return setError(t("Name your goal."));
		if (!(n > 0)) return setError(t("Set a target above zero."));
		setPending(true);
		try {
			await moneyApi.createGoal({
				name: name.trim(),
				emoji,
				targetMinor: toMinor(n, cur),
				targetDate: date || null,
			});
			await refreshMoney(queryClient);
			toast(t("New goal: {name}.", { name: name.trim() }));
			onDone();
		} catch (err) {
			setPending(false);
			setError(
				err instanceof ApiError ? err.message : t("Couldn't save. Try again."),
			);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4" noValidate>
			<MaybeAlert tone="error" message={error} />
			<Field
				label={t("What are you saving for?")}
				data-autofocus
				value={name}
				placeholder={t("Holiday, new laptop…")}
				onChange={(e) => setName(e.target.value)}
			/>
			<fieldset>
				<legend className="mb-2 font-semibold">{t("Pick an icon")}</legend>
				<div className="flex flex-wrap gap-2">
					{EMOJIS.map((e) => (
						<button
							key={e}
							type="button"
							aria-pressed={emoji === e}
							onClick={() => setEmoji(e)}
							className={cn(
								"grid size-12 place-items-center rounded-full border-2 text-[1.4rem]",
								emoji === e ? "border-plum-500 bg-plum-500/10" : "border-line",
							)}
						>
							{e}
						</button>
					))}
				</div>
			</fieldset>
			<Field
				label={t("Target")}
				inputMode="decimal"
				adornment={currencySymbol(cur)}
				value={target}
				onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ""))}
			/>
			<Field
				label={t("By when? (optional)")}
				type="date"
				value={date}
				hint={t("With a date, Spendid sets aside enough each month.")}
				onChange={(e) => setDate(e.target.value)}
			/>
			<SubmitButton pending={pending}>{t("Create goal")}</SubmitButton>
		</form>
	);
}

/** Goal jars with "add money" and a new-goal sheet. */
export function GoalsSection({ goals, cur }: { goals: Goal[]; cur: string }) {
	const [depositFor, setDepositFor] = useState<Goal | null>(null);
	const [creating, setCreating] = useState(false);

	return (
		<section aria-labelledby="goals-heading" className="space-y-3">
			<SectionHeader
				id="goals-heading"
				title={t("Goals")}
				icon={Target}
				tint="lime"
				sub={
					goals.length > 0
						? t("{saved} saved of {target}", {
								saved: formatMinor(
									goals.reduce((s, g) => s + g.savedMinor, 0),
									cur,
								),
								target: formatMinor(
									goals.reduce((s, g) => s + g.targetMinor, 0),
									cur,
								),
							})
						: undefined
				}
				action={
					<button
						type="button"
						onClick={() => setCreating(true)}
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						<Plus className="size-5" aria-hidden="true" /> {t("New goal")}
					</button>
				}
			/>
			{goals.length === 0 ? (
				<button
					type="button"
					onClick={() => setCreating(true)}
					className="relative w-full overflow-hidden rounded-panel border-2 border-dashed border-line p-5 text-left hover:border-plum-300"
				>
					<span className="flex items-center gap-4">
						<GoalJar ratio={0.35} emoji="🏝️" className="h-20 shrink-0" />
						<span>
							<span className="block font-semibold">
								{t("Saving for something?")}
							</span>
							<span className="block text-ink-soft">
								{t("Make a jar, set a date, and watch it fill.")}
							</span>
						</span>
					</span>
				</button>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{goals.map((g) => {
						const ratio = Math.min(1, g.savedMinor / g.targetMinor);
						const tint = goalTint(g.id);
						return (
							<li
								key={g.id}
								className="relative overflow-hidden rounded-panel border border-line bg-surface p-4"
							>
								<span
									aria-hidden="true"
									className={cn(
										"pointer-events-none absolute inset-0 bg-linear-to-br opacity-[0.16] dark:opacity-[0.12]",
										tint,
									)}
								/>
								<div className="relative flex gap-4">
									<GoalJar
										ratio={ratio}
										emoji={g.emoji}
										className="h-24 shrink-0"
									/>
									<div className="min-w-0 flex-1">
										<p className="font-display text-[1.1rem] leading-tight font-bold break-words">
											{g.name}
										</p>
										<p data-money className="num mt-1 leading-tight">
											<span className="text-[1.6rem] font-extrabold">
												{Math.round(ratio * 100)}%
											</span>{" "}
											<span className="block text-[0.88rem] text-ink-soft">
												{t("{saved} of {target}", {
													saved: formatMinor(g.savedMinor, cur),
													target: formatMinor(g.targetMinor, cur),
												})}
											</span>
										</p>
										<MilestoneBar ratio={ratio} tint={tint} />
									</div>
								</div>
								<div className="relative mt-3 flex flex-wrap items-center justify-between gap-2">
									<span
										data-money
										className="rounded-full bg-surface/80 px-3 py-1 text-[0.82rem] font-medium ring-1 ring-line"
									>
										{untilLabel(g, cur)}
									</span>
									<button
										type="button"
										onClick={() => setDepositFor(g)}
										className={buttonClass("coin", "md", "h-10 px-4")}
									>
										<Plus className="size-4" aria-hidden="true" />{" "}
										{t("Add money")}
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			<Sheet
				open={depositFor !== null}
				onClose={() => setDepositFor(null)}
				title={t("Add to {name}", { name: depositFor?.name ?? t("goal") })}
			>
				{depositFor && (
					<DepositForm
						goal={depositFor}
						cur={cur}
						onDone={() => setDepositFor(null)}
					/>
				)}
			</Sheet>
			<Sheet
				open={creating}
				onClose={() => setCreating(false)}
				title={t("New goal")}
			>
				<NewGoalForm cur={cur} onDone={() => setCreating(false)} />
			</Sheet>
		</section>
	);
}
