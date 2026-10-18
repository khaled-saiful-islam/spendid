import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	BadgeAlert,
	Bell,
	CalendarClock,
	Download,
	type LucideIcon,
	Mail,
	PartyPopper,
	ShieldAlert,
	ShieldCheck,
	Sparkles,
	Target,
	TrendingUp,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { TINTS } from "@/components/money/CategoryIcon";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { type Notice, noticesApi, noticesQuery } from "@/lib/notices-api";
import { formatMoment } from "@/lib/time";

/** Each kind of alert with its own icon and colour, so the list scans at a glance. */
const LOOK: Record<string, { Icon: LucideIcon; tint: string }> = {
	"subscription-due": { Icon: CalendarClock, tint: "amber" },
	"subscriptions-month": { Icon: CalendarClock, tint: "amber" },
	"bill-due": { Icon: CalendarClock, tint: "amber" },
	"price-rise": { Icon: TrendingUp, tint: "rose" },
	"budget-alert": { Icon: BadgeAlert, tint: "orange" },
	"unusual-charge": { Icon: BadgeAlert, tint: "red" },
	"duplicate-charge": { Icon: BadgeAlert, tint: "red" },
	"goal-reached": { Icon: Target, tint: "lime" },
	"warranty-ending": { Icon: ShieldCheck, tint: "teal" },
	"export-ready": { Icon: Download, tint: "sky" },
	"new-sign-in": { Icon: ShieldAlert, tint: "slate" },
	"passkey-added": { Icon: ShieldCheck, tint: "slate" },
	"money-wrapped": { Icon: PartyPopper, tint: "pink" },
	"weekly-summary": { Icon: Mail, tint: "indigo" },
	announcement: { Icon: Sparkles, tint: "violet" },
	joined: { Icon: Users, tint: "fuchsia" },
};

const when = (iso: string) =>
	formatMoment(iso, {
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "2-digit",
	});

/**
 * The bell: every alert Spendid sends also lands here (bills due, price rises, goals
 * reached), even when its email is switched off. Opening it marks them read.
 */
export function NoticesBell({ className }: { className?: string }) {
	const { data } = useQuery(noticesQuery);
	const [open, setOpen] = useState(false);
	const unread = data?.unread ?? 0;
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={
					unread > 0
						? t(unread === 1 ? "Alerts, 1 new" : "Alerts, {n} new", {
								n: unread,
							})
						: t("Alerts")
				}
				className={cn(
					"relative grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink",
					className,
				)}
			>
				<Bell className="size-5" aria-hidden="true" />
				{unread > 0 && (
					<span
						aria-hidden="true"
						className="num absolute top-1 right-1 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[0.7rem] leading-5 font-bold text-white ring-2 ring-bg"
					>
						{unread > 9 ? "9+" : unread}
					</span>
				)}
			</button>
			<NoticesSheet open={open} onClose={() => setOpen(false)} />
		</>
	);
}

function NoticesSheet({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const { data, isPending } = useQuery(noticesQuery);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const unread = data?.unread ?? 0;

	// Seen once the list is open: the count clears, the "new" dots stay for this look.
	useEffect(() => {
		if (!open || unread === 0) return;
		void noticesApi
			.markRead()
			.then(() =>
				queryClient.setQueryData(noticesQuery.queryKey, (old) =>
					old ? { ...old, unread: 0 } : old,
				),
			)
			.catch(() => undefined);
	}, [open, unread, queryClient]);

	function go(n: Notice) {
		onClose();
		if (n.path) void navigate({ to: n.path });
	}

	return (
		<Sheet open={open} onClose={onClose} title={t("Alerts")}>
			{isPending ? (
				<div className="h-32 animate-pulse rounded-tile bg-surface-2" />
			) : !data || data.items.length === 0 ? (
				<div className="rounded-tile border-2 border-dashed border-line p-6 text-center">
					<Bell className="mx-auto size-8 text-ink-soft" aria-hidden="true" />
					<p className="mt-2 font-semibold">{t("No alerts yet")}</p>
					<p className="mt-1 text-[0.92rem] text-ink-soft">
						{t(
							"Bills coming up, price changes and goals reached show up here, and by email if it's on.",
						)}
					</p>
				</div>
			) : (
				<ul className="-mx-2 divide-y divide-line">
					{data.items.map((n) => {
						const look = LOOK[n.kind] ?? { Icon: Bell, tint: "slate" };
						return (
							<li key={n.id}>
								<button
									type="button"
									onClick={() => go(n)}
									disabled={!n.path}
									className="flex w-full items-start gap-3 rounded-tile px-2 py-3 text-left hover:bg-surface-2 disabled:hover:bg-transparent"
								>
									<span
										className={cn(
											"grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br text-white",
											TINTS[look.tint],
										)}
										aria-hidden="true"
									>
										<look.Icon className="size-5" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex items-start gap-2">
											<span className="min-w-0 flex-1 leading-snug font-semibold break-words">
												{n.title}
											</span>
											{!n.read && (
												<span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-coral">
													<span className="sr-only">{t("New")}</span>
												</span>
											)}
										</span>
										<span
											data-money
											className="mt-0.5 block text-[0.9rem] leading-snug text-ink-soft"
										>
											{n.body}
										</span>
										<span className="mt-1 block text-[0.78rem] text-ink-soft">
											{when(n.createdAt)}
										</span>
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</Sheet>
	);
}
