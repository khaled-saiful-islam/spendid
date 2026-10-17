import {
	ArrowUp,
	FileText,
	Paperclip,
	Sparkles,
	Square,
	X,
} from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { isPdf } from "@/lib/pdf-to-image";

interface ComposerProps {
	busy: boolean;
	/** Floats over a conversation; on the welcome screen it sits in the flow. */
	floating: boolean;
	onSend: (question: string, attachment: File | null) => void;
	onStop: () => void;
}

/** The question box: type, or attach a receipt photo or PDF and say what to do with it. */
export function Composer({ busy, floating, onSend, onStop }: ComposerProps) {
	const [draft, setDraft] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const picker = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!file || isPdf(file)) return setPreview(null);
		const url = URL.createObjectURL(file);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);

	function submit(e: FormEvent) {
		e.preventDefault();
		if (!draft.trim() && !file) return;
		onSend(draft, file);
		setDraft("");
		setFile(null);
	}

	return (
		<form
			onSubmit={submit}
			className={cn(
				"z-20",
				floating ? "sticky bottom-24 md:bottom-4" : "mb-24 md:mb-4",
			)}
		>
			<div className="rounded-[1.75rem] bg-linear-to-r from-plum-500 via-coral to-marigold p-[2px] shadow-lift transition-shadow focus-within:shadow-[0_0_0_6px_rgb(122_79_196/0.18),0_18px_40px_-18px_rgb(42_20_70/0.45)]">
				<div className="rounded-[calc(1.75rem-2px)] bg-surface p-1.5 pl-3">
					{file && (
						<div className="mb-1.5 flex items-center gap-3 rounded-[1.2rem] bg-surface-2 p-2 pr-1">
							{preview ? (
								<img
									src={preview}
									alt=""
									className="size-12 rounded-tile object-cover"
								/>
							) : (
								<span className="grid size-12 place-items-center rounded-tile bg-plum-500/12 text-plum-500">
									<FileText className="size-6" aria-hidden="true" />
								</span>
							)}
							<span className="min-w-0 flex-1">
								<span className="block font-semibold break-words">
									{t("Receipt attached")}
								</span>
								<span className="block text-[0.85rem] text-ink-soft break-all">
									{file.name}
								</span>
							</span>
							<button
								type="button"
								onClick={() => setFile(null)}
								aria-label={t("Remove the receipt")}
								className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface"
							>
								<X className="size-5" aria-hidden="true" />
							</button>
						</div>
					)}
					<div className="flex items-end gap-1.5">
						<Sparkles
							className="mb-3 ml-1 size-5 shrink-0 text-plum-500"
							aria-hidden="true"
						/>
						<label htmlFor="ask-input" className="sr-only">
							{t("Your question")}
						</label>
						<textarea
							id="ask-input"
							rows={1}
							value={draft}
							maxLength={500}
							placeholder={
								file
									? t("What should I do with it? (optional)")
									: t("Ask or log something…")
							}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									e.currentTarget.form?.requestSubmit();
								}
							}}
							className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 outline-none [field-sizing:content] placeholder:text-ink-soft/70"
						/>
						<input
							ref={picker}
							type="file"
							accept="image/*,application/pdf"
							className="sr-only"
							tabIndex={-1}
							aria-hidden="true"
							onChange={(e) => {
								setFile(e.target.files?.[0] ?? null);
								e.target.value = "";
							}}
						/>
						<button
							type="button"
							onClick={() => picker.current?.click()}
							disabled={busy}
							aria-label={t("Attach a receipt photo or PDF")}
							className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-40"
						>
							<Paperclip className="size-5" aria-hidden="true" />
						</button>
						{busy ? (
							<button
								type="button"
								onClick={onStop}
								aria-label={t("Stop")}
								className="relative grid size-11 shrink-0 place-items-center rounded-full bg-plum-900 text-plum-50 dark:bg-plum-50 dark:text-plum-900"
							>
								<span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-marigold motion-reduce:hidden" />
								<Square className="size-4" fill="currentColor" />
							</button>
						) : (
							<motion.button
								type="submit"
								disabled={!draft.trim() && !file}
								aria-label={t("Ask")}
								whileTap={{ scale: 0.9 }}
								className="grid size-11 shrink-0 place-items-center rounded-full bg-marigold text-plum-900 shadow-coin transition-opacity disabled:opacity-40 disabled:shadow-none"
							>
								<ArrowUp className="size-5" strokeWidth={2.5} />
							</motion.button>
						)}
					</div>
				</div>
			</div>
		</form>
	);
}
