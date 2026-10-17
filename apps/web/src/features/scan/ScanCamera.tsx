import { useQueryClient } from "@tanstack/react-query";
import {
	Flashlight,
	FlashlightOff,
	ImageUp,
	RotateCcw,
	Sparkles,
	X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { buttonClass } from "@/components/ui/Button";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { isPdf, pdfToImage } from "@/lib/pdf-to-image";
import { receiptsApi } from "@/lib/receipts-api";
import { capture } from "../capture/capture-store";
import { coverTransform } from "./geometry";
import { useScanner } from "./useScanner";

const RING = 2 * Math.PI * 34;

interface ScanCameraProps {
	/** Where the read receipt goes. Default: the review sheet. The bill splitter uses its own. */
	onUploaded?: (receiptId: string) => void;
	onClose?: () => void;
	/** A receipt photo or PDF shared from another app: shown straight away. */
	file?: File;
}

/** Full-screen camera: find the receipt, hold still, it captures itself. */
export function ScanCamera({
	onUploaded = capture.openReceipt,
	onClose = capture.close,
	file,
}: ScanCameraProps = {}) {
	const queryClient = useQueryClient();
	const reduce = useReducedMotion();
	const scanner = useScanner();
	const { videoRef, status, quad, steady, photo } = scanner;
	const boxRef = useRef<HTMLDivElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const [box, setBox] = useState({ w: 1, h: 1 });
	const [video, setVideo] = useState({ w: 1, h: 1 });
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	/** A photo, screenshot or PDF: PDFs are drawn to an image first, photos get straightened. */
	const takeFile = useCallback(
		(picked: File) => {
			if (!isPdf(picked)) return void scanner.fromFile(picked);
			setError(null);
			void pdfToImage(picked)
				.then((image) => scanner.fromReadyImage(image))
				.catch(() =>
					setError(
						t(
							"Couldn't open that PDF. Try a photo or screenshot of the receipt instead.",
						),
					),
				);
		},
		[scanner],
	);

	// A receipt shared into Spendid from another app goes straight to the preview.
	const sharedTaken = useRef(false);
	useEffect(() => {
		if (!file || sharedTaken.current) return;
		sharedTaken.current = true;
		takeFile(file);
	}, [file, takeFile]);

	useEffect(() => {
		const el = boxRef.current;
		if (!el) return;
		const ro = new ResizeObserver(
			([entry]) =>
				entry &&
				setBox({ w: entry.contentRect.width, h: entry.contentRect.height }),
		);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	async function sendPhoto() {
		if (!photo) return;
		setUploading(true);
		setError(null);
		try {
			const receipt = await receiptsApi.upload(photo.blob);
			void queryClient.invalidateQueries({ queryKey: ["receipts"] });
			onUploaded(receipt.id);
		} catch (err) {
			setUploading(false);
			setError(
				err instanceof Error
					? err.message
					: t("Couldn't send the photo. Try again."),
			);
		}
	}

	const map = coverTransform(video, box);
	const points = quad?.map((p) => map(p).join(",")).join(" ");
	const hint =
		status === "starting"
			? t("Opening the camera…")
			: status === "processing"
				? t("Straightening your receipt…")
				: !quad
					? t("Fit the whole receipt in the frame")
					: steady > 0.2
						? t("Hold still…")
						: t("Got it, hold steady");

	return (
		<div
			className="fixed inset-0 z-[70] flex flex-col bg-plum-950 text-white"
			role="dialog"
			aria-modal="true"
			aria-label={t("Scan a receipt")}
		>
			<div ref={boxRef} className="relative flex-1 overflow-hidden">
				{!photo && (
					<>
						<video
							ref={videoRef}
							playsInline
							muted
							onLoadedMetadata={(e) =>
								setVideo({
									w: e.currentTarget.videoWidth,
									h: e.currentTarget.videoHeight,
								})
							}
							className="absolute inset-0 size-full object-cover"
						/>
						<svg
							className="pointer-events-none absolute inset-0 size-full"
							aria-hidden="true"
						>
							{points && (
								<motion.polygon
									points={points}
									fill="rgb(255 178 36 / 0.16)"
									stroke="var(--color-marigold)"
									strokeWidth={4}
									strokeLinejoin="round"
									initial={false}
									animate={{ opacity: 1 }}
									transition={{ duration: reduce ? 0 : 0.12 }}
								/>
							)}
						</svg>
					</>
				)}
				{photo && (
					<div className="absolute inset-0 grid place-items-center p-6">
						<div className="relative max-h-full overflow-hidden rounded-tile shadow-lift">
							<img
								src={photo.url}
								alt={t("Your receipt, straightened")}
								className="max-h-[70dvh] w-auto object-contain"
							/>
							{uploading && !reduce && (
								<motion.span
									aria-hidden="true"
									className="absolute inset-x-0 h-16 bg-linear-to-b from-transparent via-marigold/50 to-transparent"
									animate={{ top: ["-10%", "100%"] }}
									transition={{
										repeat: Number.POSITIVE_INFINITY,
										duration: 1.4,
										ease: "easeInOut",
									}}
								/>
							)}
						</div>
					</div>
				)}
				{(status === "denied" || status === "no-camera") && !photo && (
					<div className="absolute inset-0 grid place-items-center p-8 text-center">
						<div className="max-w-xs space-y-4">
							<p className="font-display text-[1.4rem] font-bold">
								{status === "denied"
									? t("Spendid needs your camera")
									: t("No camera found")}
							</p>
							<p className="text-plum-200">
								{status === "denied"
									? t(
											"Allow the camera in your browser's site settings, or pick a photo or PDF instead.",
										)
									: t(
											"Pick a photo, screenshot or PDF of your receipt instead.",
										)}
							</p>
							<button
								type="button"
								onClick={() => fileRef.current?.click()}
								className={buttonClass("coin", "md")}
							>
								<ImageUp className="size-5" aria-hidden="true" />{" "}
								{t("Choose a photo or PDF")}
							</button>
						</div>
					</div>
				)}

				<div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),1rem)]">
					<button
						type="button"
						onClick={onClose}
						aria-label={t("Close camera")}
						className="grid size-12 place-items-center rounded-full bg-black/40 backdrop-blur"
					>
						<X className="size-6" />
					</button>
					{!photo && (
						<span
							aria-live="polite"
							className="rounded-full bg-black/45 px-4 py-2 text-[0.95rem] font-medium backdrop-blur"
						>
							{hint}
						</span>
					)}
					{scanner.torch.available && !photo ? (
						<button
							type="button"
							onClick={() => void scanner.toggleTorch()}
							aria-label={
								scanner.torch.on ? t("Turn light off") : t("Turn light on")
							}
							className="grid size-12 place-items-center rounded-full bg-black/40 backdrop-blur"
						>
							{scanner.torch.on ? (
								<FlashlightOff className="size-6" />
							) : (
								<Flashlight className="size-6" />
							)}
						</button>
					) : (
						<span className="size-12" />
					)}
				</div>
			</div>

			<div className="bg-plum-950 px-6 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
				{!photo && error && (
					<div className="mx-auto mb-3 max-w-md">
						<MaybeAlert tone="error" message={error} />
					</div>
				)}
				{photo ? (
					<div className="mx-auto max-w-md space-y-3">
						<MaybeAlert tone="error" message={error} />
						<button
							type="button"
							onClick={() => void sendPhoto()}
							disabled={uploading}
							className={buttonClass("coin", "lg", "w-full")}
						>
							{uploading ? t("Sending…") : t("Use this photo")}
						</button>
						<button
							type="button"
							onClick={scanner.retake}
							disabled={uploading}
							className="inline-flex h-11 w-full items-center justify-center gap-2 font-medium text-plum-200"
						>
							<RotateCcw className="size-4" aria-hidden="true" /> {t("Retake")}
						</button>
					</div>
				) : (
					<div className="mx-auto flex max-w-md items-center justify-between">
						<button
							type="button"
							onClick={() => fileRef.current?.click()}
							aria-label={t("Choose a photo or PDF")}
							className="grid size-14 place-items-center rounded-full bg-white/10"
						>
							<ImageUp className="size-6" />
						</button>
						<button
							type="button"
							onClick={() => void scanner.capture()}
							disabled={status !== "live"}
							aria-label={t("Take photo")}
							className="relative grid size-22 place-items-center rounded-full disabled:opacity-60"
						>
							<svg
								viewBox="0 0 76 76"
								className="absolute inset-0 size-full -rotate-90"
								aria-hidden="true"
							>
								<circle
									cx="38"
									cy="38"
									r="34"
									fill="none"
									stroke="white"
									strokeOpacity=".35"
									strokeWidth="5"
								/>
								<circle
									cx="38"
									cy="38"
									r="34"
									fill="none"
									stroke="var(--color-marigold)"
									strokeWidth="5"
									strokeLinecap="round"
									strokeDasharray={RING}
									strokeDashoffset={RING * (1 - steady)}
								/>
							</svg>
							<span className="size-15 rounded-full bg-white" />
						</button>
						<button
							type="button"
							onClick={() => scanner.setAutoCapture(!scanner.autoCapture)}
							aria-pressed={scanner.autoCapture}
							className={cn(
								"grid size-14 place-items-center rounded-full text-[0.7rem] font-semibold",
								scanner.autoCapture
									? "bg-marigold text-plum-900"
									: "bg-white/10",
							)}
						>
							<Sparkles className="size-5" aria-hidden="true" />
							{t("Auto")}
						</button>
					</div>
				)}
			</div>
			<input
				ref={fileRef}
				type="file"
				accept="image/*,application/pdf"
				className="sr-only"
				onChange={(e) => {
					const picked = e.target.files?.[0];
					e.target.value = "";
					if (picked) takeFile(picked);
				}}
			/>
		</div>
	);
}
