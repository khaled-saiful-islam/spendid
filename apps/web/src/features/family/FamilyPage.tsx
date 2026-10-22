import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { t } from "@/i18n";
import { familyQuery } from "@/lib/family-api";
import { meQuery } from "@/lib/me";
import { CircleMap } from "./CircleMap";
import { InviteSheet } from "./InviteSheet";
import { Pulse } from "./Pulse";
import { SharedJars } from "./SharedJars";
import { SplitsSection } from "./split/SplitsSection";

/** Family circle: who sees what, saving together, split bills and the live pulse. */
export function FamilyPage() {
	const { data: me } = useQuery(meQuery);
	const { data } = useQuery(familyQuery);
	const [inviting, setInviting] = useState(false);
	if (!data || !me)
		return <div className="h-64 animate-pulse rounded-panel bg-surface-2" />;
	const { people, invites } = data;

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
					<button
						type="button"
						onClick={() => setInviting(true)}
						className={buttonClass("coin", "md")}
					>
						<UserPlus className="size-[1.1rem]" aria-hidden="true" />{" "}
						{t("Invite")}
					</button>
				}
			/>

			<CircleMap
				me={{ name: me.user.name, id: me.user.id }}
				people={people}
				invites={invites}
				onInvite={() => setInviting(true)}
			/>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
				<div className="space-y-5">
					<SharedJars people={people} />
					<SplitsSection />
				</div>
				<Pulse />
			</div>
			<InviteSheet open={inviting} onClose={() => setInviting(false)} />
		</div>
	);
}
