import { t } from "@/i18n";
import { cn } from "@/lib/cn";

interface LogoProps {
	className?: string;
	showWord?: boolean;
	/** Extra classes for the wordmark, e.g. to hide it on narrow screens. */
	wordClassName?: string;
}

/** Coin mark + wordmark. */
export function Logo({ className, showWord = true, wordClassName }: LogoProps) {
	return (
		<span className={cn("inline-flex items-center gap-2", className)}>
			<svg
				viewBox="0 0 64 64"
				className="size-8 shrink-0 drop-shadow-sm"
				aria-hidden="true"
			>
				<circle cx="32" cy="32" r="30" fill="var(--color-marigold)" />
				<circle
					cx="32"
					cy="32"
					r="23"
					fill="none"
					stroke="#2A1446"
					strokeWidth="3"
					strokeDasharray="2 5"
					opacity=".35"
				/>
				<path
					d="M40.5 23.5c-1.8-2.4-4.8-3.8-8.6-3.8-5 0-8.4 2.6-8.4 6.3 0 8.3 17.6 4.6 17.6 12.4 0 3.9-3.6 6.6-9 6.6-4.1 0-7.4-1.6-9.4-4.4"
					fill="none"
					stroke="#2A1446"
					strokeWidth="5"
					strokeLinecap="round"
				/>
			</svg>
			{showWord && (
				<span
					className={cn(
						"font-display text-[1.35rem] font-bold tracking-tight",
						wordClassName,
					)}
				>
					{t("Spendid")}
				</span>
			)}
		</span>
	);
}
