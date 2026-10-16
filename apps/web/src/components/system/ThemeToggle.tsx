import { Moon, Sun } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
	const { theme, toggle } = useTheme();
	const next = theme === "dark" ? "light" : "dark";
	return (
		<button
			type="button"
			onClick={toggle}
			aria-label={t(
				next === "dark" ? "Switch to dark theme" : "Switch to light theme",
			)}
			className={cn(
				"grid size-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink",
				className,
			)}
		>
			{theme === "dark" ? (
				<Sun className="size-5" />
			) : (
				<Moon className="size-5" />
			)}
		</button>
	);
}
