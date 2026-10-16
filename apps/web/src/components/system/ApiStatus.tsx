import { useQuery } from "@tanstack/react-query";
import { t } from "@/i18n";
import { fetchHealth } from "@/lib/api";
import { cn } from "@/lib/cn";

/** Live dot showing whether the API, database and Redis answer. */
export function ApiStatus({ className }: { className?: string }) {
	const { data, isPending } = useQuery({
		queryKey: ["health"],
		queryFn: fetchHealth,
		refetchInterval: 15_000,
	});

	const ok = data?.status === "ok";
	const label = isPending
		? t("Checking the server…")
		: ok
			? t("All systems running")
			: data
				? `Running with problems: ${Object.entries(data.services)
						.filter(([, s]) => s === "down")
						.map(([name]) => name)
						.join(", ")} down`
				: t("Server offline");

	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[0.82rem] text-ink-soft",
				className,
			)}
		>
			<span className="relative flex size-2.5">
				{ok && (
					<span className="absolute inset-0 animate-ping rounded-full bg-jade opacity-60" />
				)}
				<span
					className={cn(
						"relative size-2.5 rounded-full",
						isPending ? "bg-plum-300" : ok ? "bg-jade" : "bg-coral",
					)}
				/>
			</span>
			{label}
		</span>
	);
}
