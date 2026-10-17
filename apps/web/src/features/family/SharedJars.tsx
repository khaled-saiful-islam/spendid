import {
	type FamilyPerson,
	formatMinor,
	type SharedJar,
	toMinor,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { HandCoins, Plus, UsersRound } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { TINTS } from "@/components/money/CategoryIcon";
import { buttonClass } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { familyApi, jarsQuery, refreshFamily } from "@/lib/family-api";
import { ApiError } from "@/lib/http";
import { currencySymbol } from "../onboarding/options";
import { GoalJar } from "../plan/GoalJar";
import { Avatar, personGradient } from "./parts";

const errorText = (err: unknown) =>
	err instanceof ApiError ? err.message : t("That didn't work. Try again.");

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
		if (!jar || !(amount > 0))
			return setError(t("Enter an amount above zero."));
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
			toast(
				t("Added {amount} to {name}.", {
					amount: formatMinor(minor, cur),
					name: jar.name,
				}),
			);
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
			title={
				jar
					? t("Add to {name}", { name: `${jar.emoji} ${jar.name}` })
					: t("Add money")
			}
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
					label={t("Or another amount")}
					inputMode="decimal"
					data-autofocus
					adornment={currencySymbol(cur)}
					value={value}
					onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
				/>
				<MaybeAlert tone="error" message={error} />
				<SubmitButton pending={pending}>{t("Add money")}</SubmitButton>
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
					? t("{name} is now a shared jar.", { name: goal.name })
					: t("{name} is just yours again.", { name: goal.name }),
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
				goal
					? t("Who saves for {name}?", { name: `${goal.emoji} ${goal.name}` })
					: t("Save together")
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
					{t(
						"They can see this jar and add money to it. Only you can take money out.",
					)}
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
				<SubmitButton pending={pending}>{t("Save")}</SubmitButton>
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
		<li className="relative flex flex-col gap-4 overflow-hidden rounded-panel border border-line bg-surface p-4 sm:p-5">
			<span
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-0 bg-linear-to-br opacity-[0.15] dark:opacity-[0.11]",
					TINTS.amber,
				)}
			/>
			<div className="relative flex items-start gap-4">
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
						{t("of {amount}, {pct}%", {
							amount: formatMinor(jar.targetMinor, jar.currency),
							pct: Math.min(100, Math.round(ratio * 100)),
						})}
					</p>
					{!jar.mine && (
						<p className="mt-1 text-[0.85rem] text-ink-soft">
							{t("{name}'s jar", { name: jar.ownerName })}
						</p>
					)}
				</div>
			</div>
			<div className="relative">
				<span
					className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-ink/10"
					aria-hidden="true"
				>
					{jar.members
						.filter((m) => m.givenMinor > 0)
						.map((m) => (
							<motion.span
								key={m.userId}
								className={cn(
									"h-full bg-linear-to-r",
									personGradient(m.userId),
								)}
								initial={{ width: 0 }}
								animate={{
									width: `${(m.givenMinor / Math.max(jar.targetMinor, jar.savedMinor, 1)) * 100}%`,
								}}
								transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
							/>
						))}
				</span>
			</div>
			<ul className="relative space-y-1.5" aria-label={t("Who put in what")}>
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
			<div className="relative mt-auto flex flex-wrap gap-2">
				<button
					type="button"
					onClick={onAdd}
					className={buttonClass("coin", "md")}
				>
					<Plus className="size-5" aria-hidden="true" /> {t("Add money")}
				</button>
				{jar.mine ? (
					<button
						type="button"
						onClick={onMembers}
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						<UsersRound className="size-5" aria-hidden="true" /> {t("People")}
					</button>
				) : (
					<button
						type="button"
						className={buttonClass("ghost", "md")}
						onClick={() =>
							void familyApi
								.leaveJar(jar.id)
								.then(() => refreshFamily(queryClient))
								.then(() => toast(t("You left {name}.", { name: jar.name })))
								.catch((err: unknown) => toast(errorText(err)))
						}
					>
						{t("Leave jar")}
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
			<SectionHeader
				id="jars-heading"
				title={t("Saving together")}
				icon={HandCoins}
				tint="amber"
				sub={
					data.jars.length > 0
						? t("{amount} saved together", {
								amount: formatMinor(
									data.jars.reduce((n, j) => n + j.savedMinor, 0),
									data.jars[0]?.currency ?? "MYR",
								),
							})
						: undefined
				}
				action={
					canShare ? (
						<button
							type="button"
							onClick={() => setChoosing(true)}
							className={buttonClass("ghost", "md", "border-2 border-line")}
						>
							<Plus className="size-5" aria-hidden="true" /> {t("Share a goal")}
						</button>
					) : undefined
				}
			/>
			{data.jars.length === 0 ? (
				<p className="rounded-panel border-2 border-dashed border-line p-5 text-ink-soft">
					{people.length === 0
						? t(
								"Once someone joins your circle, you can save for a goal together and watch the jar fill.",
							)
						: data.myGoals.length === 0
							? t(
									"Make a goal on the Plan page, then share it here to save together.",
								)
							: t("Share one of your goals so your circle can add to it.")}
				</p>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
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
				title={t("Which goal?")}
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
