import {
	type FamilyPerson,
	LEVEL_INFO,
	type PendingInvite,
	type ShareState,
} from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Link2, Plus, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { familyApi, refreshFamily } from "@/lib/family-api";
import { Avatar, relationLabel, sinceLabel } from "./parts";

/** How much a share shows, as a colour: more shared, warmer. */
const LEVEL_COLOR: Record<string, string> = {
	totals: "var(--color-sky)",
	categories: "var(--color-jade)",
	transactions: "var(--color-marigold)",
};

const isOn = (s: ShareState | null): s is ShareState => !!s && !s.paused;

/**
 * One direction of sharing as an arrow between two people. When something is shared, a dot
 * travels along it the way the data goes; when nothing is, the line is dashed.
 */
function Flow({
	state,
	toRight,
	label,
}: {
	state: ShareState | null;
	toRight: boolean;
	label: string;
}) {
	const reduce = useReducedMotion();
	const on = isOn(state);
	const color = on ? LEVEL_COLOR[state.level] : undefined;
	return (
		<div className="relative flex items-center">
			<span
				className={cn(
					"relative h-0.5 flex-1 rounded-full",
					!on && "border-t-2 border-dashed border-white/25 bg-transparent",
				)}
				style={on ? { background: color } : undefined}
			>
				{on && !reduce && (
					<motion.span
						className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-white shadow"
						initial={{ left: toRight ? "0%" : "100%" }}
						animate={{ left: toRight ? "100%" : "0%" }}
						transition={{
							duration: 2.4,
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeInOut",
						}}
					/>
				)}
			</span>
			<span
				aria-hidden="true"
				className={cn(
					"absolute top-1/2 size-0 -translate-y-1/2 border-y-[5px] border-y-transparent",
					toRight ? "-right-0.5 border-l-[7px]" : "-left-0.5 border-r-[7px]",
				)}
				style={{
					[toRight ? "borderLeftColor" : "borderRightColor"]: on
						? color
						: "rgb(255 255 255 / 0.3)",
				}}
			/>
			<span className="absolute inset-x-0 -top-[1.15rem] text-center">
				<span
					className={cn(
						"inline-block max-w-full rounded-full px-2 text-[0.72rem] leading-5 font-semibold break-words",
						on ? "bg-plum-950/40 text-plum-50" : "bg-plum-950/30 text-plum-200",
					)}
				>
					{label}
				</span>
			</span>
		</div>
	);
}

const levelWord = (s: ShareState) => t(LEVEL_INFO[s.level].label).toLowerCase();

function PersonRow({
	person,
	me,
}: {
	person: FamilyPerson;
	me: { name: string; id: string };
}) {
	const mine = person.iShare;
	const theirs = person.theyShare;
	const theySee =
		mine && !mine.paused
			? t("sees your {what}", { what: levelWord(mine) })
			: mine?.paused
				? t("your sharing is paused")
				: t("sees nothing of yours");
	const youSee =
		theirs && !theirs.paused
			? t("you see their {what}", { what: levelWord(theirs) })
			: theirs?.paused
				? t("their sharing is paused")
				: t("you see nothing of theirs");

	return (
		<li>
			<Link
				to="/app/family/$userId"
				params={{ userId: person.userId }}
				className="group block rounded-tile p-3 transition-colors hover:bg-white/5"
			>
				<div className="flex items-center gap-3">
					<Avatar name={me.name} seed={me.id} size="sm" />
					<div className="min-w-0 flex-1 space-y-7 pt-5 pb-1">
						<Flow state={person.iShare} toRight label={theySee} />
						<Flow state={person.theyShare} toRight={false} label={youSee} />
					</div>
					<Avatar
						name={person.name}
						seed={person.userId}
						size="md"
						className="ring-plum-900 dark:ring-plum-800"
					/>
				</div>
				<div className="mt-1.5 flex items-start justify-between gap-3">
					<span className="text-[0.82rem] text-plum-200">{t("You")}</span>
					<span className="min-w-0 text-right">
						<span className="flex items-center justify-end gap-1 font-semibold break-words">
							{person.name}
							<ChevronRight
								className="size-4 shrink-0 text-plum-200 transition-transform group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</span>
						<span className="block text-[0.8rem] text-plum-200">
							{t("{relation}, since {date}", {
								relation: relationLabel(person.relation),
								date: sinceLabel(person.since),
							})}
						</span>
					</span>
				</div>
			</Link>
		</li>
	);
}

function InviteRow({ invite }: { invite: PendingInvite }) {
	const queryClient = useQueryClient();
	const days = Math.max(
		1,
		Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / 86_400_000),
	);
	return (
		<li className="flex items-center gap-3 rounded-tile border-2 border-dashed border-white/20 px-3 py-2.5">
			<span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-marigold">
				<Link2 className="size-4" aria-hidden="true" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-semibold break-words">
					{t("Waiting for your {relation}", {
						relation: relationLabel(invite.relation).toLowerCase(),
					})}
					{invite.email ? `, ${invite.email}` : ""}
				</span>
				<span className="block text-[0.82rem] text-plum-200">
					{t(
						days === 1
							? "You'll share {level}. Ends in 1 day."
							: "You'll share {level}. Ends in {n} days.",
						{
							level: t(LEVEL_INFO[invite.level].label).toLowerCase(),
							n: days,
						},
					)}
				</span>
			</span>
			<button
				type="button"
				aria-label={t("Cancel this invite")}
				onClick={() =>
					void familyApi
						.cancelInvite(invite.id)
						.then(() => refreshFamily(queryClient))
						.then(() => toast(t("Invite cancelled. The link no longer works.")))
						.catch(() => toast(t("Couldn't cancel. Try again.")))
				}
				className="grid size-10 shrink-0 place-items-center rounded-full text-plum-200 hover:bg-white/10 hover:text-plum-50"
			>
				<X className="size-5" aria-hidden="true" />
			</button>
		</li>
	);
}

const SEATS = ["Partner", "Parent", "Kid"];

/**
 * The circle as a map: you on the left, each person on the right, and two arrows between
 * you that show what each side lets the other see. Colour says how much is shared.
 */
export function CircleMap({
	me,
	people,
	invites,
	onInvite,
}: {
	me: { name: string; id: string };
	people: FamilyPerson[];
	invites: PendingInvite[];
	onInvite: () => void;
}) {
	return (
		<section
			aria-label={t("Who sees what")}
			className="bg-scales relative overflow-hidden rounded-panel bg-plum-900 p-3 text-plum-50 sm:p-4 dark:bg-plum-800"
		>
			{people.length === 0 ? (
				<div className="p-2">
					<div className="flex items-center gap-3">
						<Avatar name={me.name} seed={me.id} size="md" />
						<p className="text-[0.95rem] text-plum-200">
							{t("Your circle starts with you. Who should join?")}
						</p>
					</div>
					<ul className="mt-4 grid grid-cols-3 gap-2">
						{SEATS.map((seat) => (
							<li key={seat}>
								<button
									type="button"
									onClick={onInvite}
									className="flex w-full flex-col items-center gap-2 rounded-tile border-2 border-dashed border-white/20 px-2 py-4 text-[0.9rem] font-semibold hover:border-marigold hover:text-marigold"
								>
									<span className="grid size-10 place-items-center rounded-full bg-white/10">
										<Plus className="size-5" aria-hidden="true" />
									</span>
									{t(seat)}
								</button>
							</li>
						))}
					</ul>
				</div>
			) : (
				<ul className="divide-y divide-white/10">
					{people.map((p) => (
						<PersonRow key={p.userId} person={p} me={me} />
					))}
				</ul>
			)}
			{invites.length > 0 && (
				<ul className="mt-2 space-y-2">
					{invites.map((i) => (
						<InviteRow key={i.id} invite={i} />
					))}
				</ul>
			)}
			{people.length > 0 && (
				<p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-3 pb-1 text-[0.75rem] text-plum-200">
					{(["totals", "categories", "transactions"] as const).map((level) => (
						<span key={level} className="inline-flex items-center gap-1.5">
							<span
								className="h-0.5 w-4 rounded-full"
								style={{ background: LEVEL_COLOR[level] }}
								aria-hidden="true"
							/>
							{t(LEVEL_INFO[level].label)}
						</span>
					))}
				</p>
			)}
		</section>
	);
}
