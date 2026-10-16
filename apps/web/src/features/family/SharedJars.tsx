import {
	type FamilyPerson,
	formatMinor,
	type SharedJar,
	toMinor,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { HandCoins, Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { familyApi, jarsQuery, refreshFamily } from "@/lib/family-api";
import { ApiError } from "@/lib/http";
import { currencySymbol } from "../onboarding/options";
import { GoalJar } from "../plan/GoalJar";
import { Avatar } from "./parts";

const errorText = (err: unknown) =>
	err instanceof ApiError ? err.message : "That didn't work. Try again.";

function DepositSheet({
	jar,
	onClose,
}: {
	jar: SharedJar | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [value, setValue] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const cur = jar?.currency ?? "MYR";

	async function add(amount: number) {
		if (!jar || !(amount > 0)) return setError("Enter an amount above zero.");
		setPending(true);
		setError(null);
		try {
			const minor = toMinor(amount, cur);
			await familyApi.depositJar(jar.id, minor);
			await refreshFamily(queryClient);
			if (
				jar.savedMinor < jar.targetMinor &&
				jar.savedMinor + minor >= jar.targetMinor &&
				!window.matchMedia("(prefers-reduced-motion: reduce)").matches
			)
				void confetti({
					particleCount: 160,
					spread: 100,
					origin: { y: 0.6 },
					colors: ["#FFB224", "#12B886", "#7A4FC4", "#FF5C7A"],
				});
			toast(`Added ${formatMinor(minor, cur)} to ${jar.name}.`);
			setValue("");
			setPending(false);
			onClose();
		} catch (err) {
			setPending(false);
			setError(errorText(err));
		}
	}

	return (
		<Sheet
			open={jar !== null}
			onClose={onClose}
			title={jar ? `Add to ${jar.emoji} ${jar.name}` : "Add money"}
		>
			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					void add(Number(value.replace(",", ".")));
				}}
			>
				<div className="flex flex-wrap gap-2">
					{[20, 50, 100].map((q) => (
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
				<MaybeAlert tone="error" message={error} />
				<SubmitButton pending={pending}>Add money</SubmitButton>
			</form>
		</Sheet>
	);
}

function MembersSheet({
	goal,
	people,
	current,
	onClose,
}: {
	goal: { id: string; name: string; emoji: string } | null;
	people: FamilyPerson[];
	current: string[];
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [picked, setPicked] = useState<string[]>(current);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function save() {
		if (!goal) return;
		setPending(true);
		setError(null);
		try {
			await familyApi.setJarMembers(goal.id, picked);
			await refreshFamily(queryClient);
			toast(
				picked.length
					? `${goal.name} is now a shared jar.`
					: `${goal.name} is just yours again.`,
			);
			setPending(false);
			onClose();
		} catch (err) {
			setPending(false);
			setError(errorText(err));
		}
	}

	return (
		<Sheet
			open={goal !== null}
			onClose={onClose}
			title={
				goal ? `Who saves for ${goal.emoji} ${goal.name}?` : "Save together"
			}
		>
			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<p className="text-ink-soft">
					They can see this jar and add money to it. Only you can take money
					out.
				</p>
				<ul className="space-y-2">
					{people.map((p) => {
						const on = picked.includes(p.userId);
						return (
							<li key={p.userId}>
								<label
									className={cn(
										"flex cursor-pointer items-center gap-3 rounded-tile border-2 px-4 py-3",
										on ? "border-plum-500 bg-plum-500/8" : "border-line",
									)}
								>
									<input
										type="checkbox"
										checked={on}
										className="size-5 accent-[var(--color-plum-500)]"
										onChange={() =>
											setPicked((list) =>
												on
													? list.filter((id) => id !== p.userId)
													: [...list, p.userId],
											)
										}
									/>
									<Avatar name={p.name} seed={p.userId} size="sm" />
									<span className="font-semibold break-words">{p.name}</span>
								</label>
							</li>
						);
					})}
				</ul>
				<MaybeAlert tone="error" message={error} />
				<SubmitButton pending={pending}>Save</SubmitButton>
			</form>
		</Sheet>
	);
}

function JarCard({
	jar,
	onAdd,
	onMembers,
}: {
	jar: SharedJar;
	onAdd: () => void;
	onMembers: () => void;
}) {
	const queryClient = useQueryClient();
	const ratio = jar.targetMinor > 0 ? jar.savedMinor / jar.targetMinor : 0;
	return (
		<li className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5">
			<div className="flex items-start gap-4">
				<GoalJar
					ratio={ratio}
					emoji={jar.emoji}
					className="h-28 w-24 shrink-0"
				/>
				<div className="min-w-0 flex-1">
					<h3 className="text-[1.2rem] font-bold break-words">
						{jar.emoji} {jar.name}
					</h3>
					<p className="num mt-1 text-[1.5rem] font-extrabold">
						{formatMinor(jar.savedMinor, jar.currency)}
					</p>
					<p className="text-[0.9rem] text-ink-soft">
						of {formatMinor(jar.targetMinor, jar.currency)},{" "}
						{Math.min(100, Math.round(ratio * 100))}%
					</p>
					{!jar.mine && (
						<p className="mt-1 text-[0.85rem] text-ink-soft">
							{jar.ownerName}'s jar
						</p>
					)}
				</div>
			</div>
			<ul className="space-y-1.5" aria-label="Who put in what">
				{jar.members.map((m) => (
					<li key={m.userId} className="flex items-center gap-2 text-[0.92rem]">
						<Avatar name={m.name} seed={m.userId} size="sm" />
						<span className="min-w-0 flex-1 break-words">{m.name}</span>
						<span className="num font-semibold">
							{formatMinor(m.givenMinor, jar.currency)}
						</span>
					</li>
				))}
			</ul>
			<div className="mt-auto flex flex-wrap gap-2">
				<button
					type="button"
					onClick={onAdd}
					className={buttonClass("coin", "md")}
				>
					<Plus className="size-5" aria-hidden="true" /> Add money
				</button>
				{jar.mine ? (
					<button
						type="button"
						onClick={onMembers}
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						<UsersRound className="size-5" aria-hidden="true" /> People
					</button>
				) : (
					<button
						type="button"
						className={buttonClass("ghost", "md")}
						onClick={() =>
							void familyApi
								.leaveJar(jar.id)
								.then(() => refreshFamily(queryClient))
								.then(() => toast(`You left ${jar.name}.`))
								.catch((err: unknown) => toast(errorText(err)))
						}
					>
						Leave jar
					</button>
				)}
			</div>
		</li>
	);
}

/** Goals people save for together; the liquid rises with every deposit. */
export function SharedJars({ people }: { people: FamilyPerson[] }) {
	const { data } = useQuery(jarsQuery);
	const [depositFor, setDepositFor] = useState<SharedJar | null>(null);
	const [membersFor, setMembersFor] = useState<{
		id: string;
		name: string;
		emoji: string;
		current: string[];
	} | null>(null);
	const [choosing, setChoosing] = useState(false);
	if (!data)
		return <div className="h-40 animate-pulse rounded-panel bg-surface-2" />;
	const canShare = people.length > 0 && data.myGoals.length > 0;

	return (
		<section aria-labelledby="jars-heading" className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2
					id="jars-heading"
					className="flex items-center gap-2 text-[1.6rem] font-bold"
				>
					<HandCoins className="size-6 text-marigold-deep" aria-hidden="true" />{" "}
					Saving together
				</h2>
				{canShare && (
					<button
						type="button"
						onClick={() => setChoosing(true)}
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						<Plus className="size-5" aria-hidden="true" /> Share a goal
					</button>
				)}
			</div>
			{data.jars.length === 0 ? (
				<p className="rounded-panel border-2 border-dashed border-line p-5 text-ink-soft">
					{people.length === 0
						? "Once someone joins your circle, you can save for a goal together and watch the jar fill."
						: data.myGoals.length === 0
							? "Make a goal on the Plan page, then share it here to save together."
							: "Share one of your goals so your circle can add to it."}
				</p>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{data.jars.map((jar) => (
						<JarCard
							key={jar.id}
							jar={jar}
							onAdd={() => setDepositFor(jar)}
							onMembers={() =>
								setMembersFor({
									id: jar.id,
									name: jar.name,
									emoji: jar.emoji,
									current: jar.members
										.map((m) => m.userId)
										.filter((id) => id !== jar.ownerId),
								})
							}
						/>
					))}
				</ul>
			)}
			<Sheet
				open={choosing}
				onClose={() => setChoosing(false)}
				title="Which goal?"
			>
				<ul className="space-y-2">
					{data.myGoals.map((g) => (
						<li key={g.id}>
							<button
								type="button"
								onClick={() => {
									setChoosing(false);
									setMembersFor({ ...g, current: [] });
								}}
								className="flex w-full items-center gap-3 rounded-tile border-2 border-line px-4 py-3 text-left font-semibold hover:bg-surface-2"
							>
								<span className="text-[1.5rem]" aria-hidden="true">
									{g.emoji}
								</span>
								<span className="break-words">{g.name}</span>
							</button>
						</li>
					))}
				</ul>
			</Sheet>
			<DepositSheet jar={depositFor} onClose={() => setDepositFor(null)} />
			<MembersSheet
				key={membersFor?.id ?? "none"}
				goal={membersFor}
				people={people}
				current={membersFor?.current ?? []}
				onClose={() => setMembersFor(null)}
			/>
		</section>
	);
}
