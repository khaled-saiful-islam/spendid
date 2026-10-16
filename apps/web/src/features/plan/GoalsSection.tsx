import { formatMinor, type Goal, toMinor } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/http";
import { moneyApi, refreshMoney } from "@/lib/money-api";
import { currencySymbol } from "../onboarding/options";
import { GoalJar } from "./GoalJar";

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

function untilLabel(goal: Goal, cur: string): string {
	if (goal.savedMinor >= goal.targetMinor) return "Done! Time to enjoy it.";
	if (!goal.targetDate) return "No deadline. Add whenever you like.";
	const when = new Date(`${goal.targetDate}T12:00`).toLocaleDateString(
		undefined,
		{ month: "short", year: "numeric" },
	);
	return `${formatMinor(goal.monthlyNeededMinor, cur)} a month to make it by ${when}.`;
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
	const quick = [50, 100, 500];

	async function add(amount: number) {
		if (!(amount > 0)) return;
		setPending(true);
		const updated = await moneyApi.depositGoal(goal.id, toMinor(amount, cur));
		await refreshMoney(queryClient);
		if (
			updated.savedMinor >= updated.targetMinor &&
			goal.savedMinor < goal.targetMinor
		)
			cheer();
		toast(`Added ${formatMinor(toMinor(amount, cur), cur)} to ${goal.name}.`);
		onDone();
	}

	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				void add(Number(value.replace(",", ".")));
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
				label="Or another amount"
				inputMode="decimal"
				data-autofocus
				adornment={currencySymbol(cur)}
				value={value}
				onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
			/>
			<SubmitButton pending={pending}>Add to {goal.name}</SubmitButton>
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
		const n = Number(target.replace(",", "."));
		if (!name.trim()) return setError("Name your goal.");
		if (!(n > 0)) return setError("Set a target above zero.");
		setPending(true);
		try {
			await moneyApi.createGoal({
				name: name.trim(),
				emoji,
				targetMinor: toMinor(n, cur),
				targetDate: date || null,
			});
			await refreshMoney(queryClient);
			toast(`New goal: ${name.trim()}.`);
			onDone();
		} catch (err) {
			setPending(false);
			setError(
				err instanceof ApiError ? err.message : "Couldn't save. Try again.",
			);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4" noValidate>
			<MaybeAlert tone="error" message={error} />
			<Field
				label="What are you saving for?"
				data-autofocus
				value={name}
				placeholder="Holiday, new laptop…"
				onChange={(e) => setName(e.target.value)}
			/>
			<fieldset>
				<legend className="mb-2 font-semibold">Pick an icon</legend>
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
				label="Target"
				inputMode="decimal"
				adornment={currencySymbol(cur)}
				value={target}
				onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ""))}
			/>
			<Field
				label="By when? (optional)"
				type="date"
				value={date}
				hint="With a date, Spendid sets aside enough each month."
				onChange={(e) => setDate(e.target.value)}
			/>
			<SubmitButton pending={pending}>Create goal</SubmitButton>
		</form>
	);
}

/** Goal jars with "add money" and a new-goal sheet. */
export function GoalsSection({ goals, cur }: { goals: Goal[]; cur: string }) {
	const [depositFor, setDepositFor] = useState<Goal | null>(null);
	const [creating, setCreating] = useState(false);

	return (
		<section aria-labelledby="goals-heading" className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<h2 id="goals-heading" className="text-[1.6rem] font-bold">
					Goals
				</h2>
				<button
					type="button"
					onClick={() => setCreating(true)}
					className={buttonClass("ghost", "md", "border-2 border-line")}
				>
					<Plus className="size-5" aria-hidden="true" /> New goal
				</button>
			</div>
			{goals.length === 0 ? (
				<p className="rounded-panel border border-dashed border-line p-6 text-center text-ink-soft">
					Saving for something? Make a jar and watch it fill.
				</p>
			) : (
				<ul className="grid gap-4 sm:grid-cols-2">
					{goals.map((g) => (
						<li
							key={g.id}
							className="flex gap-4 rounded-panel border border-line bg-surface p-4"
						>
							<GoalJar
								ratio={g.savedMinor / g.targetMinor}
								emoji={g.emoji}
								className="h-28 shrink-0"
							/>
							<div className="min-w-0 flex-1">
								<p className="font-display text-[1.2rem] font-bold break-words">
									{g.name}
								</p>
								<p className="num mt-1">
									<strong>{formatMinor(g.savedMinor, cur)}</strong>{" "}
									<span className="text-ink-soft">
										of {formatMinor(g.targetMinor, cur)}
									</span>
								</p>
								<p className="mt-1 text-[0.88rem] text-ink-soft">
									{untilLabel(g, cur)}
								</p>
								<button
									type="button"
									onClick={() => setDepositFor(g)}
									className={buttonClass("coin", "md", "mt-3 h-10 px-4")}
								>
									Add money
								</button>
							</div>
						</li>
					))}
				</ul>
			)}

			<Sheet
				open={depositFor !== null}
				onClose={() => setDepositFor(null)}
				title={`Add to ${depositFor?.name ?? "goal"}`}
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
				title="New goal"
			>
				<NewGoalForm cur={cur} onDone={() => setCreating(false)} />
			</Sheet>
		</section>
	);
}
