import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Download, EyeOff, Share2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { pngToPdf, saveFile } from "@/lib/image-pdf";
import { monthName, wrappedQuery } from "@/lib/insights-api";
import { drawShareCard } from "./shareCard";
import { buildSlides } from "./slides";

const SLIDE_MS = 6500;

function ShareSlide({ month, onDone }: { month: string; onDone: () => void }) {
	const { data } = useQuery(wrappedQuery(month));
	const [hide, setHide] = useState(false);
	const [url, setUrl] = useState<string | null>(null);
	const [blob, setBlob] = useState<Blob | null>(null);

	useEffect(() => {
		if (!data) return;
		let made: string | null = null;
		void drawShareCard(data, hide).then((b) => {
			made = URL.createObjectURL(b);
			setBlob(b);
			setUrl(made);
		});
		return () => {
			if (made) URL.revokeObjectURL(made);
		};
	}, [data, hide]);

	const fileName = `spendid-${month}`;
	const title = t("My {month} on Spendid", { month: monthName(month) });
	const canShareFile =
		blob !== null &&
		typeof navigator.canShare === "function" &&
		navigator.canShare({
			files: [new File([blob], `${fileName}.png`, { type: "image/png" })],
		});

	/** Sharing to other apps sends the picture: that's what they accept. */
	async function share() {
		if (!blob) return;
		const file = new File([blob], `${fileName}.png`, { type: "image/png" });
		await navigator.share({ files: [file], title }).catch(() => undefined);
	}

	/** Downloads are PDFs. */
	async function download() {
		if (!blob) return;
		try {
			saveFile(await pngToPdf(blob, title), `${fileName}.pdf`);
			toast(t("Saved as a PDF."));
		} catch {
			toast(t("Couldn't make the PDF. Try again."));
		}
	}

	return (
		<div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-white">
			<p className="text-[1.6rem] font-bold">{t("Share your month")}</p>
			<div className="aspect-[4/5] w-full max-w-[18rem] overflow-hidden rounded-panel bg-white/10 shadow-lift">
				{url ? (
					<img
						src={url}
						alt={t("Your {month} summary card", { month: monthName(month) })}
						className="size-full object-cover"
					/>
				) : null}
			</div>
			<label className="flex items-center gap-3 rounded-full bg-white/15 px-4 py-2 font-semibold">
				<input
					type="checkbox"
					checked={hide}
					onChange={(e) => setHide(e.target.checked)}
					className="size-5 accent-[var(--color-marigold)]"
				/>
				<EyeOff className="size-5" aria-hidden="true" /> {t("Hide amounts")}
			</label>
			<div className="flex flex-wrap justify-center gap-2">
				{canShareFile && (
					<button
						type="button"
						onClick={() => void share()}
						className="inline-flex h-12 items-center gap-2 rounded-full bg-marigold px-6 font-semibold text-plum-900 shadow-coin"
					>
						<Share2 className="size-5" aria-hidden="true" /> {t("Share")}
					</button>
				)}
				<button
					type="button"
					onClick={() => void download()}
					disabled={!blob}
					className={
						canShareFile
							? "inline-flex h-12 items-center gap-2 rounded-full border-2 border-white/40 px-5 font-semibold disabled:opacity-50"
							: "inline-flex h-12 items-center gap-2 rounded-full bg-marigold px-6 font-semibold text-plum-900 shadow-coin disabled:opacity-50"
					}
				>
					<Download className="size-5" aria-hidden="true" /> {t("Download PDF")}
				</button>
				<button
					type="button"
					onClick={onDone}
					className="h-12 rounded-full border-2 border-white/40 px-6 font-semibold"
				>
					{t("Done")}
				</button>
			</div>
		</div>
	);
}

/**
 * Money Wrapped: a full-screen story. Tap the right side (or →) for next, left (←) for back,
 * hold to pause. Advances by itself unless the person prefers reduced motion.
 */
export function WrappedStory({ month }: { month: string }) {
	const navigate = useNavigate();
	const reduce = useReducedMotion();
	const { data, isPending, error } = useQuery(wrappedQuery(month));
	const [index, setIndex] = useState(0);
	const [paused, setPaused] = useState(false);
	const slides = data ? buildSlides(data) : [];
	const total = slides.length + 1;
	const close = useCallback(
		() => void navigate({ to: "/app/activity", search: { view: "insights" } }),
		[navigate],
	);
	const go = useCallback(
		(by: number) => setIndex((i) => Math.min(total - 1, Math.max(0, i + by))),
		[total],
	);
	const onShare = index === total - 1;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "ArrowRight") go(1);
			if (e.key === "ArrowLeft") go(-1);
			if (e.key === "Escape") close();
		};
		window.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
		};
	}, [go, close]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: restart the timer on every slide change
	useEffect(() => {
		if (reduce || paused || onShare || !data) return;
		const t = setTimeout(() => go(1), SLIDE_MS);
		return () => clearTimeout(t);
	}, [index, reduce, paused, onShare, data, go]);

	const slide = slides[index];
	return (
		<div
			className="fixed inset-0 z-[70] bg-plum-950"
			role="dialog"
			aria-modal="true"
			aria-label={t("Money Wrapped for {month}", { month: monthName(month) })}
		>
			<AnimatePresence mode="popLayout">
				<motion.div
					key={slide?.id ?? "share"}
					className={cn(
						"absolute inset-0 bg-linear-to-br",
						slide?.bg ?? "from-plum-950 via-plum-800 to-plum-700",
					)}
					initial={{ opacity: 0, scale: 1.04 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.45 }}
				>
					<div
						className="bg-scales pointer-events-none absolute inset-0 opacity-15"
						aria-hidden="true"
					/>
				</motion.div>
			</AnimatePresence>

			<div
				className={cn(
					"relative mx-auto flex h-full max-w-lg flex-col pt-safe transition-colors",
					slide?.ink === "dark" ? "text-plum-950" : "text-white",
				)}
			>
				<div className="flex gap-1.5 px-4 pt-4" aria-hidden="true">
					{Array.from({ length: total }, (_, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: one progress bar per slide position
							key={i}
							className="h-1 flex-1 overflow-hidden rounded-full bg-current/30"
						>
							<motion.span
								// biome-ignore lint/suspicious/noArrayIndexKey: remount restarts the bar when the slide changes
								key={`${i}-${index}`}
								className="block h-full bg-current"
								initial={{ width: i < index ? "100%" : "0%" }}
								animate={{
									width:
										i < index
											? "100%"
											: i === index
												? reduce || onShare
													? "100%"
													: paused
														? undefined
														: "100%"
												: "0%",
								}}
								transition={{
									duration:
										i === index && !reduce && !onShare ? SLIDE_MS / 1000 : 0,
									ease: "linear",
								}}
							/>
						</span>
					))}
				</div>
				<div className="flex justify-end px-3 pt-2">
					<button
						type="button"
						onClick={close}
						aria-label={t("Close")}
						className="grid size-11 place-items-center rounded-full hover:bg-current/15"
					>
						<X className="size-6" aria-hidden="true" />
					</button>
				</div>

				<div className="relative min-h-0 flex-1">
					{isPending ? (
						<div className="grid h-full place-items-center text-white/80">
							{t("Wrapping your month…")}
						</div>
					) : error || !data ? (
						<div className="grid h-full place-items-center px-6 text-center text-white">
							{t("Couldn't load this month. Try again in a moment.")}
						</div>
					) : onShare ? (
						<ShareSlide month={month} onDone={close} />
					) : (
						<>
							<AnimatePresence mode="wait">
								<motion.div
									key={slide?.id}
									className={cn(
										"flex h-full flex-col justify-center px-7 pb-24",
										slide?.ink === "dark" ? "text-plum-950" : "text-white",
									)}
									initial={{ opacity: 0, x: 30 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: -30 }}
									transition={{ duration: 0.3 }}
								>
									{slide?.body}
								</motion.div>
							</AnimatePresence>
							{/* Tap zones: left third back, the rest forward; hold to pause. */}
							<button
								type="button"
								aria-label={t("Previous")}
								className="absolute inset-y-0 left-0 w-1/3"
								onClick={() => go(-1)}
								onPointerDown={() => setPaused(true)}
								onPointerUp={() => setPaused(false)}
								onPointerLeave={() => setPaused(false)}
							/>
							<button
								type="button"
								aria-label={t("Next")}
								className="absolute inset-y-0 right-0 w-2/3"
								onClick={() => go(1)}
								onPointerDown={() => setPaused(true)}
								onPointerUp={() => setPaused(false)}
								onPointerLeave={() => setPaused(false)}
							/>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
