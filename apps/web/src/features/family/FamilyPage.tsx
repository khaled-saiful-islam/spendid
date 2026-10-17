import { LEVEL_INFO, type PendingInvite } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Link2, ReceiptText, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { familyApi, familyQuery, refreshFamily } from "@/lib/family-api";
import { meQuery } from "@/lib/me";
import { CircleOrbit } from "./CircleOrbit";
import { InviteSheet } from "./InviteSheet";
import { Pulse } from "./Pulse";
import { Avatar, relationLabel, ShareChip, sinceLabel } from "./parts";
import { SharedJars } from "./SharedJars";
import { SplitsSection } from "./split/SplitsSection";

function InviteRow({ invite }: { invite: PendingInvite }) {
	const queryClient = useQueryClient();
	const days = Math.max(
		1,
		Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / 86_400_000),
	);
	return (
		<li className="flex items-center gap-3 rounded-tile border-2 border-dashed border-line px-4 py-3">
			<span className="grid size-10 shrink-0 place-items-center rounded-full bg-plum-500/10 text-plum-500">
				<Link2 className="size-5" aria-hidden="true" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-semibold break-words">
					{t("Invite for your {relation}", {
						relation: relationLabel(invite.relation).toLowerCase(),
					})}
					{invite.email ? `, ${invite.email}` : ""}
				</span>
				<span className="block text-[0.85rem] text-ink-soft">
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
				className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
			>
				<X className="size-5" aria-hidden="true" />
			</button>
		</li>
	);
}

/** Family circle: who's in it, what each side shares, the live pulse, shared jars and splits. */
export function FamilyPage() {
	const { data: me } = useQuery(meQuery);
	const { data } = useQuery(familyQuery);
	const [inviting, setInviting] = useState(false);
	if (!data || !me)
		return <div className="h-64 animate-pulse rounded-panel bg-surface-2" />;
	const { people, invites } = data;
	const openSeats = Math.max(invites.length, people.length === 0 ? 3 : 0);

	return (
		<div className="space-y-5">
			<PageHeader
				title={
					people.length === 0
						? t("Bring your people in")
						: t("Your family circle")
				}
				sub={
					people.length === 0
						? t(
								"Invite your partner, parents or kids. You each choose what to share, from just a monthly total to every receipt.",
							)
						: t(
								people.length === 1
									? "1 person in your circle. Both sides always see what's shared."
									: "{n} people in your circle. Both sides always see what's shared.",
								{ n: people.length },
							)
				}
				aside={
					<div className="w-24 shrink-0 sm:w-28">
						<CircleOrbit
							me={{ name: me.user.name, id: me.user.id }}
							people={people}
							openSeats={openSeats}
							compact
						/>
					</div>
				}
			/>
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => setInviting(true)}
					className={buttonClass("coin", "md")}
				>
					<UserPlus className="size-[1.1rem]" aria-hidden="true" />{" "}
					{t("Invite someone")}
				</button>
				<Link
					to="/app/family/split"
					className={buttonClass("ghost", "md", "border-2 border-line")}
				>
					<ReceiptText className="size-[1.1rem]" aria-hidden="true" />{" "}
					{t("Split a bill")}
				</Link>
			</div>

			{(people.length > 0 || invites.length > 0) && (
				<section aria-labelledby="people-heading" className="space-y-3">
					<h2 id="people-heading" className="text-[1.2rem] font-bold">
						{t("People")}
					</h2>
					<ul className="grid gap-3 sm:grid-cols-2">
						{people.map((p) => (
							<li key={p.userId}>
								<Link
									to="/app/family/$userId"
									params={{ userId: p.userId }}
									className="group flex items-center gap-4 rounded-panel border border-line bg-surface p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lift"
								>
									<Avatar name={p.name} seed={p.userId} />
									<span className="min-w-0 flex-1 space-y-1.5">
										<span className="block">
											<span className="text-[1.1rem] font-bold break-words">
												{p.name}
											</span>{" "}
											<span className="text-ink-soft">
												{t("{relation}, since {date}", {
													relation: relationLabel(p.relation),
													date: sinceLabel(p.since),
												})}
											</span>
										</span>
										<span className="flex flex-wrap gap-1.5">
											<ShareChip label={t("You see")} state={p.theyShare} />
											<ShareChip label={t("They see")} state={p.iShare} />
										</span>
									</span>
									<ChevronRight
										className="size-5 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5"
										aria-hidden="true"
									/>
								</Link>
							</li>
						))}
					</ul>
					{invites.length > 0 && (
						<ul className="space-y-2">
							{invites.map((i) => (
								<InviteRow key={i.id} invite={i} />
							))}
						</ul>
					)}
				</section>
			)}

			<Pulse />
			<SharedJars people={people} />
			<SplitsSection />
			<InviteSheet open={inviting} onClose={() => setInviting(false)} />
		</div>
	);
}
