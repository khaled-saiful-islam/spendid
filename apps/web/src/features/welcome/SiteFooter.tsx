import { Lock } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ApiStatus } from "@/components/system/ApiStatus";
import { ThemeToggle } from "@/components/system/ThemeToggle";

export function SiteFooter() {
	return (
		<footer className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
			<div className="flex flex-col gap-4 rounded-panel bg-plum-900 p-6 text-plum-50 sm:flex-row sm:items-center sm:p-8 dark:bg-plum-800">
				<Lock className="size-8 shrink-0 text-marigold" aria-hidden="true" />
				<p className="max-w-[60ch] text-[1.05rem]">
					Your money stays yours. The people who run Spendid can't see your
					spending, and you can export or delete everything whenever you like.
				</p>
			</div>
			<div className="mt-8 flex flex-wrap items-center justify-between gap-4">
				<Logo />
				<div className="flex flex-wrap items-center gap-2">
					<ApiStatus />
					<ThemeToggle />
				</div>
			</div>
		</footer>
	);
}
