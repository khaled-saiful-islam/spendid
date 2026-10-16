import { AnimatePresence, motion, useMotionValue } from "motion/react";
import { useEffect } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { buttonClass } from "@/components/ui/Button";
import { capture } from "../capture/capture-store";
import { ListeningOrb } from "./ListeningOrb";
import { useVoiceCapture } from "./useVoiceCapture";
import { VoiceReview } from "./VoiceReview";

const EXAMPLES = [
	"“Grab 15, coffee 6, and 40 for dinner with Sam”",
	"“Lunch twelve fifty yesterday”",
	"“Teh tarik tiga ringgit”",
];

/** The whole voice flow inside the sheet: listen → read → review → save. */
export function VoiceCapture() {
	const loudness = useMotionValue(0);
	const { phase, start, stop, reset } = useVoiceCapture(loudness);

	// Start listening as soon as the sheet opens — one tap from the + button.
	useEffect(() => {
		void start();
		return reset;
	}, [start, reset]);

	if (phase.kind === "review") {
		return (
			<VoiceReview
				result={phase.result}
				onAgain={() => void start()}
				onDone={capture.close}
			/>
		);
	}

	const listening = phase.kind === "listening";
	const hearing = listening && phase.hearing;
	const title =
		phase.kind === "starting"
			? "Getting the mic ready…"
			: phase.kind === "reading"
				? "Reading your note…"
				: phase.kind === "error"
					? "Let's try that again"
					: hearing
						? "Listening…"
						: "Say what you spent";

	return (
		<div className="space-y-6 pb-2 text-center">
			<div className="pt-4 pb-2">
				<ListeningOrb
					loudness={loudness}
					hearing={hearing}
					busy={phase.kind === "starting" || phase.kind === "reading"}
					label={listening ? "Done talking" : "Start listening"}
					onClick={
						listening
							? stop
							: phase.kind === "error" || phase.kind === "idle"
								? () => void start()
								: undefined
					}
				/>
			</div>
			<div aria-live="polite">
				<p className="font-display text-[1.6rem] font-bold">{title}</p>
				<AnimatePresence mode="wait">
					{listening && !hearing && (
						<motion.p
							key="hint"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="mx-auto mt-2 max-w-[32ch] text-ink-soft"
						>
							Several things at once is fine. Try {EXAMPLES[0]}
						</motion.p>
					)}
					{hearing && (
						<motion.p
							key="hearing"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="mt-2 text-ink-soft"
						>
							Pause when you're done, or tap the coin.
						</motion.p>
					)}
				</AnimatePresence>
			</div>
			{phase.kind === "error" && (
				<div className="space-y-3 text-left">
					<MaybeAlert tone="error" message={phase.message} />
					<div className="flex flex-wrap justify-center gap-2">
						<button
							type="button"
							onClick={() => void start()}
							className={buttonClass("coin", "md")}
						>
							Try again
						</button>
						<button
							type="button"
							onClick={capture.openType}
							className={buttonClass("ghost", "md", "border-2 border-line")}
						>
							Type it instead
						</button>
					</div>
				</div>
			)}
			{listening && (
				<button
					type="button"
					onClick={stop}
					className={buttonClass("ink", "lg", "w-full")}
				>
					Done
				</button>
			)}
			<p className="text-[0.82rem] text-ink-soft">
				Your voice is turned into text and then deleted. It's never stored.
			</p>
		</div>
	);
}
