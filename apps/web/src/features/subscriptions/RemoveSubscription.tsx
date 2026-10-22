import type { Subscription } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import {
	refreshSubscriptions,
	subscriptionsApi,
} from "@/lib/subscriptions-api";

/**
 * Removes a subscription for good, after a second tap (there's no Undo). Nothing else goes with
 * it: expenses already logged for it stay. `row` is the small form for a list row.
 */
export function RemoveSubscription({
	sub,
	variant,
	onRemoved,
}: {
	sub: Subscription;
	variant: "sheet" | "row";
	onRemoved?: () => void;
}) {
	const queryClient = useQueryClient();
	const [asking, setAsking] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function remove() {
		setPending(true);
		setError(null);
		try {
			await subscriptionsApi.remove(sub.id);
			await refreshSubscriptions(queryClient);
			toast(t("{name} removed.", { name: sub.name }));
			onRemoved?.();
		} catch {
			setError(t("Couldn't remove it. Try again."));
			setPending(false);
		}
	}

	if (!asking)
		return variant === "sheet" ? (
			<button
				type="button"
				onClick={() => setAsking(true)}
				className="inline-flex h-11 w-full items-center justify-center gap-2 font-medium text-ink-soft hover:text-over"
			>
				<Trash2 className="size-4" aria-hidden="true" />
				{t("Remove")}
			</button>
		) : (
			<button
				type="button"
				onClick={() => setAsking(true)}
				aria-label={t("Remove {name}", { name: sub.name })}
				className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-over"
			>
				<Trash2 className="size-4" aria-hidden="true" />
			</button>
		);

	return (
		<fieldset
			aria-label={t("Remove {name}?", { name: sub.name })}
			className={cn(
				"space-y-2",
				variant === "sheet"
					? "rounded-tile border-2 border-line p-3"
					: "w-full basis-full",
			)}
		>
			<p className="text-[0.92rem] leading-snug">
				{variant === "sheet"
					? t(
							"Remove {name} for good? Spendid stops tracking it. Expenses you've logged for it stay.",
							{ name: sub.name },
						)
					: t("Remove {name} for good?", { name: sub.name })}
			</p>
			{error && (
				<p role="alert" className="text-[0.9rem] text-over">
					{error}
				</p>
			)}
			<div className="flex gap-2">
				<button
					type="button"
					disabled={pending}
					onClick={() => void remove()}
					className="min-h-11 flex-1 rounded-full bg-over px-4 py-2 leading-snug font-semibold text-white disabled:opacity-60 dark:text-plum-950"
				>
					{pending ? t("Removing…") : t("Remove for good")}
				</button>
				<button
					type="button"
					disabled={pending}
					onClick={() => {
						setAsking(false);
						setError(null);
					}}
					className="min-h-11 flex-1 rounded-full border-2 border-line px-4 py-2 leading-snug font-semibold"
				>
					{t("Keep it")}
				</button>
			</div>
		</fieldset>
	);
}
