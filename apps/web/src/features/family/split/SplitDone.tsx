import type { SplitDto } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { QrCode } from "@/components/ui/QrCode";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { familyApi, refreshFamily } from "@/lib/family-api";
import { SplitSummary } from "./SplitSummary";

/** The finished split: who owes what, plus the link to send. */
export function SplitDone({
	split: initial,
	showDone = true,
}: {
	split: SplitDto;
	showDone?: boolean;
}) {
	const queryClient = useQueryClient();
	const [split, setSplit] = useState(initial);
	const [copied, setCopied] = useState(false);
	const url = split.url ?? "";
	const canShare = typeof navigator !== "undefined" && "share" in navigator;

	return (
		<div className="space-y-6">
			<SplitSummary
				split={split}
				onTogglePaid={(key, paid) =>
					void familyApi
						.setPaid(split.id, key, paid)
						.then((next) => {
							setSplit(next);
							return refreshFamily(queryClient);
						})
						.catch(() => toast(t("Couldn't save. Try again.")))
				}
			/>
			{url && (
				<section className="grid items-center gap-5 rounded-panel border border-line bg-surface p-5 sm:grid-cols-[auto_1fr]">
					<div className="mx-auto w-44">
						<QrCode text={url} label={t("QR code for the split link")} />
					</div>
					<div className="space-y-3">
						<h2 className="text-[1.3rem] font-bold">{t("Send the split")}</h2>
						<p className="text-ink-soft">
							{t(
								"Anyone with the link sees the names and amounts on this bill, nothing else.",
							)}
						</p>
						<p className="rounded-tile border-2 border-dashed border-line px-3 py-2 text-[0.88rem] break-all">
							{url}
						</p>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								className={buttonClass("ink", "md")}
								onClick={() =>
									void navigator.clipboard
										.writeText(url)
										.then(() => {
											setCopied(true);
											setTimeout(() => setCopied(false), 2000);
										})
										.catch(() =>
											toast(t("Couldn't copy. Select the link instead.")),
										)
								}
							>
								{copied ? (
									<Check className="size-5" aria-hidden="true" />
								) : (
									<Copy className="size-5" aria-hidden="true" />
								)}
								{copied ? t("Copied") : t("Copy link")}
							</button>
							{canShare && (
								<button
									type="button"
									className={buttonClass("ghost", "md", "border-2 border-line")}
									onClick={() =>
										void navigator
											.share({ title: split.title, url })
											.catch(() => undefined)
									}
								>
									<Share2 className="size-5" aria-hidden="true" /> {t("Share")}
								</button>
							)}
						</div>
					</div>
				</section>
			)}
			{showDone && (
				<Link to="/app/family" className={buttonClass("coin", "lg", "w-full")}>
					{t("Done")}
				</Link>
			)}
		</div>
	);
}
