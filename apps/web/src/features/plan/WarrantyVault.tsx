import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { dateLocale, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { warrantiesQuery } from "@/lib/receipts-api";

const DAY = 86_400_000;

function left(endsOn: string): {
	label: string;
	tone: "ok" | "soon" | "ended";
} {
	const days = Math.ceil(
		(new Date(`${endsOn}T23:59`).getTime() - Date.now()) / DAY,
	);
	if (days < 0) return { label: t("Ended"), tone: "ended" };
	if (days <= 30)
		return {
			label: t(days === 1 ? "1 day left" : "{n} days left", { n: days }),
			tone: "soon",
		};
	const months = Math.round(days / 30.4);
	return {
		label: t(months === 1 ? "1 month left" : "{n} months left", { n: months }),
		tone: "ok",
	};
}

/** Everything still under warranty, soonest to end first. Hidden when empty. */
export function WarrantyVault() {
	const { data: warranties = [] } = useQuery(warrantiesQuery);
	if (warranties.length === 0) return null;

	return (
		<section aria-labelledby="warranty-heading" className="space-y-3">
			<h2 id="warranty-heading" className="text-[1.6rem] font-bold">
				{t("Warranty vault")}
			</h2>
			<ul className="divide-y divide-line rounded-panel border border-line bg-surface">
				{warranties.map((w) => {
					const status = left(w.endsOn);
					return (
						<li key={w.id} className="flex items-center gap-3 p-4">
							<span className="grid size-11 shrink-0 place-items-center rounded-full bg-plum-500/12 text-plum-500">
								<ShieldCheck className="size-5" aria-hidden="true" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block font-semibold break-words">
									{w.itemName}
								</span>
								<span className="block text-[0.85rem] text-ink-soft">
									{t("Until")}{" "}
									{new Date(`${w.endsOn}T12:00`).toLocaleDateString(
										dateLocale(),
										{
											day: "numeric",
											month: "short",
											year: "numeric",
										},
									)}
								</span>
							</span>
							<span
								className={cn(
									"shrink-0 rounded-full px-2.5 py-1 text-[0.8rem] font-semibold",
									status.tone === "soon"
										? "bg-marigold/20"
										: status.tone === "ended"
											? "bg-surface-2 text-ink-soft"
											: "bg-jade/12 text-safe",
								)}
							>
								{status.label}
							</span>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
