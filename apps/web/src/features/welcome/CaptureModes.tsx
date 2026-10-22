import { Keyboard, Mic, ScanLine } from "lucide-react";
import { t } from "@/i18n";

const BARS = [8, 18, 28, 14, 32, 22, 10, 26, 16, 30, 12, 20, 9];

/** Three ways to log, each drawn as the thing it is: a voice note, a receipt, a typed line. */
export function CaptureModes() {
	return (
		<section
			aria-labelledby="capture-title"
			className="mx-auto max-w-6xl px-4 py-20 sm:px-6"
		>
			<h2
				id="capture-title"
				className="max-w-[18ch] text-[clamp(2rem,6vw,3.4rem)] font-bold"
			>
				{t("Log it the way it happened.")}
			</h2>
			<p className="mt-4 max-w-[52ch] text-[1.1rem] text-ink-soft">
				{t(
					"Most people quit budgeting because typing every expense is tiring. Spendid takes a sentence, a photo or a few keystrokes and does the rest.",
				)}
			</p>

			<div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
				<article className="rounded-panel bg-plum-900 p-6 text-plum-50 dark:bg-plum-800">
					<Mic className="size-6 text-marigold" aria-hidden="true" />
					<h3 className="mt-4 text-[1.5rem] font-bold">{t("Say it")}</h3>
					<div className="mt-5 flex h-10 items-center gap-1" aria-hidden="true">
						{BARS.map((h, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
								key={i}
								className="w-1.5 rounded-full bg-marigold"
								style={{ height: h }}
							/>
						))}
					</div>
					<p className="mt-4 font-display text-[1.15rem]">
						{t("“Lunch 12, split with Sam”")}
					</p>
					<p className="mt-2 text-[0.95rem] text-plum-200">
						{t("Logged as Lunch RM 12.00. Sam owes you RM 6.00.")}
					</p>
				</article>

				<article className="relative rounded-t-panel bg-surface p-6 shadow-lift [mask:conic-gradient(from_-45deg_at_bottom,#0000,#000_1deg_89deg,#0000_90deg)_50%/18px_100%]">
					<ScanLine className="size-6 text-plum-500" aria-hidden="true" />
					<h3 className="mt-4 text-[1.5rem] font-bold">{t("Snap it")}</h3>
					<dl className="mt-5 space-y-1.5 border-t border-dashed border-line pt-4 text-[0.95rem]">
						{[
							[t("Milk 1L"), "RM 7.20"],
							[t("Bread"), "RM 4.50"],
							[t("Eggs x10"), "RM 6.90"],
						].map(([item, price]) => (
							<div key={item} className="flex justify-between">
								<dt>{item}</dt>
								<dd className="num">{price}</dd>
							</div>
						))}
					</dl>
					<p className="mt-4 pb-4 text-[0.95rem] text-ink-soft">
						{t("Shop, items and tax read for you. Groceries, sorted.")}
					</p>
				</article>

				<article className="rounded-panel border-2 border-dashed border-line p-6">
					<Keyboard className="size-6 text-plum-500" aria-hidden="true" />
					<h3 className="mt-4 text-[1.5rem] font-bold">{t("Type it")}</h3>
					<p className="mt-5 flex h-12 items-center rounded-full bg-surface-2 px-4 font-medium">
						{t("coffee 6.50")}
						<span className="ml-0.5 inline-block h-5 w-0.5 animate-pulse bg-plum-500" />
					</p>
					<p className="mt-4 text-[0.95rem] text-ink-soft">
						{t(
							"Shorthand is fine. Spendid fills in the category and the shop.",
						)}
					</p>
				</article>
			</div>
		</section>
	);
}
