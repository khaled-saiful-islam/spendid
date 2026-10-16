import { Eye, EyeOff } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { hideMoney, useHideMoney } from "@/lib/hide-money";

/** Eye in the header: blur all amounts when someone might be looking over your shoulder. */
export function HideMoneyToggle({ className }: { className?: string }) {
	const hidden = useHideMoney();
	return (
		<button
			type="button"
			onClick={hideMoney.toggle}
			aria-pressed={hidden}
			aria-label={hidden ? t("Show amounts") : t("Hide amounts")}
			title={hidden ? t("Show amounts") : t("Hide amounts")}
			className={cn(
				"grid size-11 place-items-center rounded-full transition-colors hover:bg-surface-2 hover:text-ink",
				hidden ? "bg-plum-500/12 text-plum-500" : "text-ink-soft",
				className,
			)}
		>
			{hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
		</button>
	);
}
