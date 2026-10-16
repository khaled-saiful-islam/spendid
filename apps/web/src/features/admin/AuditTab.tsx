import { useQuery } from "@tanstack/react-query";
import { auditQuery } from "@/lib/admin-api";

const LABELS: Record<string, string> = {
	"account.paused": "Paused an account",
	"account.restored": "Restored an account",
	"account.deleted": "Deleted an account",
	"account.reset-sent": "Sent a password reset",
	"ai.limit-set": "Changed AI settings",
	"settings.updated": "Changed app settings",
};

/** Every admin action, newest first — for accountability. */
export function AuditTab() {
	const { data = [], isPending } = useQuery(auditQuery);
	if (isPending)
		return <div className="h-40 animate-pulse rounded-panel bg-surface-2" />;
	if (data.length === 0)
		return (
			<p className="rounded-panel border border-dashed border-line p-6 text-center text-ink-soft">
				No admin actions yet.
			</p>
		);
	return (
		<ol className="divide-y divide-line rounded-panel border border-line bg-surface">
			{data.map((e) => (
				<li
					key={e.id}
					className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
				>
					<span className="min-w-0">
						<span className="font-semibold">
							{LABELS[e.action] ?? e.action}
						</span>
						{e.targetLabel && (
							<span className="break-all text-ink-soft">
								{" "}
								for {e.targetLabel}
							</span>
						)}
						<span className="block text-[0.82rem] text-ink-soft">
							by {e.actorName ?? "a removed admin"}
						</span>
					</span>
					<time
						className="shrink-0 text-[0.85rem] text-ink-soft"
						dateTime={e.createdAt}
					>
						{new Date(e.createdAt).toLocaleString(undefined, {
							day: "numeric",
							month: "short",
							hour: "numeric",
							minute: "2-digit",
						})}
					</time>
				</li>
			))}
		</ol>
	);
}
