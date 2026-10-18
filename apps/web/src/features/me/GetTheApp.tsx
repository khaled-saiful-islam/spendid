import { Share2, Smartphone } from "lucide-react";
import { useState } from "react";
import { InstallSheet } from "@/components/system/InstallSheet";
import { buttonClass } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { t } from "@/i18n";
import { useInstall } from "@/lib/install";

/** Profile: install Spendid on this device, or pass it on with a QR code or the link. */
export function GetTheApp() {
	const install = useInstall();
	const [open, setOpen] = useState(false);
	return (
		<section
			aria-labelledby="app-heading"
			className="rounded-panel border border-line bg-surface p-5 sm:p-6"
		>
			<SectionHeader
				id="app-heading"
				title={t("Spendid on your phone")}
				icon={Smartphone}
				tint="cyan"
				sub={
					install.installed
						? t("Installed on this device. Share it with family and friends.")
						: t("Install it from your browser, and share it with friends.")
				}
			/>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={buttonClass(
					install.installed ? "ghost" : "coin",
					"md",
					install.installed ? "mt-4 border-2 border-line" : "mt-4",
				)}
			>
				{install.installed ? (
					<Share2 className="size-5" aria-hidden="true" />
				) : (
					<Smartphone className="size-5" aria-hidden="true" />
				)}
				{install.installed ? t("Share Spendid") : t("Get the app")}
			</button>
			<InstallSheet open={open} onClose={() => setOpen(false)} />
		</section>
	);
}
