import {
	type FamilyPerson,
	LEVEL_INFO,
	type ShareLevel,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	Eye,
	PauseCircle,
	PlayCircle,
	UserMinus,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
	familyApi,
	familyQuery,
	previewQuery,
	refreshFamily,
	viewQuery,
} from "@/lib/family-api";
import { ApiError } from "@/lib/http";
import { Avatar, LevelPicker, relationLabel, sinceLabel } from "./parts";
import { SharedViewCard } from "./SharedViewCard";

type Tab = "theirs" | "mine";

function TheirSide({ person }: { person: FamilyPerson }) {
	const { data, isPending, error } = useQuery(viewQuery(person.userId));
	if (isPending)
		return <div className="h-48 animate-pulse rounded-panel bg-surface-2" />;
	if (error || !data)
		return (
			<p className="rounded-panel border-2 border-dashed border-line p-5 text-ink-soft">
				{person.name} isn't sharing anything with you yet.
			</p>
		);
	return <SharedViewCard view={data} ownerId={person.userId} />;
}

function MySide({ person }: { person: FamilyPerson }) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { data: preview } = useQuery(previewQuery(person.userId));
	const current = person.iShare;
	const [level, setLevel] = useState<ShareLevel>(current?.level ?? "totals");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [leaving, setLeaving] = useState(false);
	const paused = current?.paused ?? false;

	async function save(
		next: { level: ShareLevel; paused: boolean },
		message: string,
	) {
		setPending(true);
		setError(null);
		try {
			await familyApi.share(person.userId, next);
			await refreshFamily(queryClient);
			toast(message);
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : "Couldn't save. Try again.",
			);
		}
		setPending(false);
	}

	async function leave() {
		try {
			await familyApi.leave(person.userId);
			// Leave this page first so it doesn't refetch a view that no longer exists.
			await navigate({ to: "/app/family" });
			await refreshFamily(queryClient);
			toast(
				`You left ${person.name}'s circle. Nothing is shared between you now.`,
			);
		} catch (err) {
			toast(
				err instanceof ApiError ? err.message : "Couldn't do that. Try again.",
			);
		}
	}

	return (
		<div className="space-y-6">
			<form
				className="space-y-4 rounded-panel border border-line bg-surface p-5"
				onSubmit={(e) => {
					e.preventDefault();
					void save(
						{ level, paused },
						`${person.name} now sees: ${LEVEL_INFO[level].label.toLowerCase()}. We let them know.`,
					);
				}}
			>
				<LevelPicker
					legend={`What ${person.name} can see`}
					name="my-level"
					value={level}
					onChange={setLevel}
				/>
				<MaybeAlert tone="error" message={error} />
				<SubmitButton pending={pending} variant="ink">
					Save what I share
				</SubmitButton>
				<button
					type="button"
					disabled={pending}
					onClick={() =>
						void save(
							{ level: current?.level ?? level, paused: !paused },
							paused
								? `Sharing with ${person.name} is back on.`
								: `Sharing with ${person.name} is paused.`,
						)
					}
					className={buttonClass("ghost", "lg", "w-full border-2 border-line")}
				>
					{paused ? (
						<PlayCircle className="size-5" aria-hidden="true" />
					) : (
						<PauseCircle className="size-5" aria-hidden="true" />
					)}
					{paused ? "Turn sharing back on" : "Pause sharing"}
				</button>
			</form>

			<section
				aria-labelledby="preview-heading"
				className="relative rounded-panel border-2 border-plum-300 bg-surface p-5"
			>
				<span className="absolute -top-3.5 left-5 inline-flex items-center gap-1.5 rounded-full bg-plum-500 px-3 py-1 text-[0.85rem] font-semibold text-white">
					<Eye className="size-4" aria-hidden="true" /> Exactly what{" "}
					{person.name} sees
				</span>
				<h3 id="preview-heading" className="sr-only">
					What {person.name} sees
				</h3>
				<div className="pt-3">
					{preview ? (
						<SharedViewCard view={preview} ownerId={null} />
					) : (
						<div className="h-40 animate-pulse rounded-tile bg-surface-2" />
					)}
				</div>
			</section>

			<button
				type="button"
				onClick={() => setLeaving(true)}
				className="inline-flex items-center gap-2 font-semibold text-over underline-offset-4 hover:underline"
			>
				<UserMinus className="size-5" aria-hidden="true" /> Stop sharing and
				leave each other's circle
			</button>
			<Sheet
				open={leaving}
				onClose={() => setLeaving(false)}
				title={`Leave ${person.name}'s circle?`}
			>
				<div className="space-y-4">
					<p className="text-ink-soft">
						Neither of you will see anything of the other any more, and shared
						jars between you stop. Your own money stays exactly as it is. We'll
						let {person.name} know.
					</p>
					<button
						type="button"
						onClick={() => void leave()}
						className="h-14 w-full rounded-full bg-coral font-semibold text-white"
					>
						Leave circle
					</button>
				</div>
			</Sheet>
		</div>
	);
}

/** One person: what they share with me, and what I share with them (with a live preview). */
export function PersonPage({ userId }: { userId: string }) {
	const { data } = useQuery(familyQuery);
	const [tab, setTab] = useState<Tab>("theirs");
	if (!data)
		return <div className="h-64 animate-pulse rounded-panel bg-surface-2" />;
	const person = data.people.find((p) => p.userId === userId);
	if (!person)
		return (
			<div className="space-y-4">
				<p className="text-ink-soft">
					This person isn't in your circle any more.
				</p>
				<Link to="/app/family" className={buttonClass("ink", "md")}>
					Back to Family
				</Link>
			</div>
		);

	return (
		<div className="space-y-6">
			<Link
				to="/app/family"
				className="inline-flex items-center gap-2 font-semibold text-ink-soft hover:text-ink"
			>
				<ArrowLeft className="size-5" aria-hidden="true" /> Family
			</Link>
			<header className="flex items-center gap-4">
				<Avatar name={person.name} seed={person.userId} size="lg" />
				<div className="min-w-0">
					<h1 className="text-[clamp(1.8rem,6vw,2.4rem)] leading-tight font-bold break-words">
						{person.name}
					</h1>
					<p className="text-ink-soft">
						Your {relationLabel(person.relation).toLowerCase()}, in your circle
						since {sinceLabel(person.since)}
					</p>
				</div>
			</header>
			<div
				role="tablist"
				aria-label="Sharing"
				className="relative grid grid-cols-2 rounded-full bg-surface-2 p-1"
			>
				{(["theirs", "mine"] as const).map((t) => (
					<button
						key={t}
						type="button"
						role="tab"
						aria-selected={tab === t}
						onClick={() => setTab(t)}
						className={cn(
							"relative z-10 min-h-11 rounded-full px-3 py-2 font-semibold transition-colors",
							tab === t ? "text-plum-50 dark:text-plum-900" : "text-ink-soft",
						)}
					>
						{tab === t && (
							<motion.span
								layoutId="person-tab"
								className="absolute inset-0 -z-10 rounded-full bg-plum-900 dark:bg-plum-50"
								transition={{ type: "spring", stiffness: 420, damping: 34 }}
							/>
						)}
						{t === "theirs" ? `${person.name} shares` : "You share"}
					</button>
				))}
			</div>
			<div role="tabpanel">
				{tab === "theirs" ? (
					<TheirSide person={person} />
				) : (
					<MySide key={person.iShare?.updatedAt ?? "none"} person={person} />
				)}
			</div>
		</div>
	);
}
