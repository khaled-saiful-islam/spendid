import { Languages } from "lucide-react";
import { getLang, type Lang, setLang, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { api } from "@/lib/http";

const OPTIONS: { id: Lang; label: string }[] = [
	{ id: "en", label: "English" },
	{ id: "ms", label: "Bahasa Melayu" },
];

/** English / Bahasa Melayu. Signed in, it's saved to the profile too (emails and Ask follow it). */
export function LanguageSwitch({
	signedIn,
	className,
}: {
	signedIn: boolean;
	className?: string;
}) {
	const current = getLang();
	async function choose(lang: Lang) {
		if (lang === current) return;
		if (signedIn)
			await api("/api/me/locale", {
				method: "PUT",
				body: JSON.stringify({ locale: lang }),
			}).catch(() => undefined);
		setLang(lang);
	}
	return (
		<fieldset
			className={cn(
				"inline-flex items-center gap-1 rounded-full bg-surface-2 p-1",
				className,
			)}
		>
			<legend className="sr-only">{t("Language")}</legend>
			<Languages className="mx-1.5 size-4 text-ink-soft" aria-hidden="true" />
			{OPTIONS.map((o) => (
				<button
					key={o.id}
					type="button"
					lang={o.id}
					aria-pressed={current === o.id}
					onClick={() => void choose(o.id)}
					className={cn(
						"min-h-9 rounded-full px-3 text-[0.9rem] font-semibold transition-colors",
						current === o.id
							? "bg-plum-900 text-plum-50 dark:bg-plum-50 dark:text-plum-900"
							: "text-ink-soft hover:text-ink",
					)}
				>
					{o.label}
				</button>
			))}
		</fieldset>
	);
}
