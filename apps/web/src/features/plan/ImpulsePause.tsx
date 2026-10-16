import {
	formatMinor,
	toMinor,
	WISH_COOLDOWN_HOURS,
	type Wish,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { Clock, ExternalLink, Hourglass, Plus, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { delightApi, wishesQuery } from "@/lib/delight-api";
import { ApiError } from "@/lib/http";
import { capture } from "../capture/capture-store";
import { currencySymbol } from "../onboarding/options";

const COOL_MS = WISH_COOLDOWN_HOURS * 3_600_000;

/** Re-render every minute so countdowns move. */
function useNow(): number {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(t);
	}, []);
	return now;
}

/** A ring that fills as the 48 hours pass, with the hours left inside. */
function CooldownRing({ wish, now }: { wish: Wish; now: number }) {
	const left = Math.max(0, new Date(wish.coolUntil).getTime() - now);
	const done = 1 - left / COOL_MS;
	const r = 22;
	const c = 2 * Math.PI * r;
	return (
		<div className="relative grid size-16 shrink-0 place-items-center">
			<svg
				viewBox="0 0 56 56"
				className="absolute inset-0 -rotate-90"
				aria-hidden="true"
			>
				<circle
					cx="28"
					cy="28"
					r={r}
					fill="none"
					stroke="var(--surface-2)"
					strokeWidth="6"
				/>
				<motion.circle
					cx="28"
					cy="28"
					r={r}
					fill="none"
					stroke={left === 0 ? "var(--color-jade)" : "var(--color-plum-500)"}
					strokeWidth="6"
					strokeLinecap="round"
					strokeDasharray={c}
					initial={{ strokeDashoffset: c }}
					animate={{ strokeDashoffset: c * (1 - done) }}
					transition={{ duration: 1 }}
				/>
			</svg>
			<span className="num text-center text-[0.8rem] leading-tight font-bold">
				{left === 0
					? "Ready"
					: `${Math.min(WISH_COOLDOWN_HOURS, Math.ceil(left / 3_600_000))} h`}
			</span>
		</div>
	);
}

function AddWish({
	open,
	onClose,
	currency,
}: {
	open: boolean;
	onClose: () => void;
	currency: string;
}) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [price, setPrice] = useState("");
	const [link, setLink] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		const amount = Number(price.replace(",", "."));
		if (!name.trim()) return setError("What do you want to buy?");
		if (!(amount > 0)) return setError("Add the price.");
		setPending(true);
		setError(null);
		try {
			await delightApi.addWish({
				name: name.trim(),
				priceMinor: toMinor(amount, currency),
				currency,
				link: link.trim() || null,
			});
			await queryClient.invalidateQueries({ queryKey: wishesQuery.queryKey });
			toast(
				`${name.trim()} is waiting. Decide in ${WISH_COOLDOWN_HOURS} hours.`,
			);
			setName("");
			setPrice("");
			setLink("");
			onClose();
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : "Couldn't save. Try again.",
			);
		}
		setPending(false);
	}

	return (
		<Sheet open={open} onClose={onClose} title="Want something?">
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				<p className="text-ink-soft">
					Park it here for {WISH_COOLDOWN_HOURS} hours. If you still want it
					then, buy it with a clear head.
				</p>
				<Field
					label="What is it?"
					data-autofocus
					value={name}
					maxLength={80}
					placeholder="Noise-cancelling headphones"
					onChange={(e) => setName(e.target.value)}
				/>
				<Field
					label="Price"
					inputMode="decimal"
					adornment={currencySymbol(currency)}
					value={price}
					onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))}
				/>
				<Field
					label="Link (optional)"
					type="url"
					value={link}
					placeholder="https://"
					onChange={(e) => setLink(e.target.value)}
				/>
				<MaybeAlert tone="error" message={error} />
				<SubmitButton pending={pending}>
					Start the {WISH_COOLDOWN_HOURS}-hour wait
				</SubmitButton>
			</form>
		</Sheet>
	);
}

/** Impulse pause: wishes wait 48 hours; skipping them adds up as money saved. */
export function ImpulsePause() {
	const queryClient = useQueryClient();
	const { data } = useQuery(wishesQuery);
	const now = useNow();
	const [adding, setAdding] = useState(false);
	if (!data)
		return <div className="h-40 animate-pulse rounded-panel bg-surface-2" />;
	const money = (minor: number, cur = data.currency) => formatMinor(minor, cur);

	async function decide(w: Wish, decision: "bought" | "skipped") {
		try {
			await delightApi.decide(w.id, decision);
			await queryClient.invalidateQueries({ queryKey: wishesQuery.queryKey });
			if (decision === "skipped") {
				if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
					void confetti({
						particleCount: 70,
						spread: 60,
						origin: { y: 0.7 },
						colors: ["#12B886", "#FFB224"],
					});
				toast(`Skipped. ${money(w.priceMinor, w.currency)} stays with you.`);
			} else {
				capture.openTypeWith({
					merchant: w.name,
					amountMinor: w.priceMinor,
					currency: w.currency,
				});
			}
		} catch {
			toast("Couldn't save. Try again.");
		}
	}

	return (
		<section aria-labelledby="pause-heading" className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2
					id="pause-heading"
					className="flex items-center gap-2 text-[1.6rem] font-bold"
				>
					<Hourglass className="size-6 text-plum-500" aria-hidden="true" /> Wait
					before you buy
				</h2>
				<button
					type="button"
					onClick={() => setAdding(true)}
					className={buttonClass("ghost", "md", "border-2 border-line")}
				>
					<Plus className="size-5" aria-hidden="true" /> Add a want
				</button>
			</div>
			{data.savedMinor > 0 && (
				<p className="inline-flex items-center gap-2 rounded-full bg-jade/15 px-4 py-2 font-semibold text-safe">
					<Sparkles className="size-4" aria-hidden="true" />{" "}
					{money(data.savedMinor)} not spent thanks to waiting
				</p>
			)}
			{data.waiting.length === 0 ? (
				<p className="rounded-panel border-2 border-dashed border-line p-5 text-ink-soft">
					Tempted by something? Add it here and wait {WISH_COOLDOWN_HOURS}{" "}
					hours. You'll see what it costs in hours of work, and most urges pass.
				</p>
			) : (
				<ul className="space-y-3">
					<AnimatePresence initial={false}>
						{data.waiting.map((w) => {
							const ready = new Date(w.coolUntil).getTime() <= now;
							return (
								<motion.li
									key={w.id}
									layout
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, x: -40 }}
									className="flex flex-wrap items-center gap-4 rounded-panel border border-line bg-surface p-4"
								>
									<CooldownRing wish={w} now={now} />
									<div className="min-w-0 flex-1">
										<p className="flex flex-wrap items-center gap-x-2 font-semibold break-words">
											{w.name}
											{w.link && (
												<a
													href={w.link}
													target="_blank"
													rel="noopener noreferrer"
													className="text-plum-500"
													aria-label={`Open the link for ${w.name}`}
												>
													<ExternalLink className="size-4" aria-hidden="true" />
												</a>
											)}
										</p>
										<p className="num text-[1.2rem] font-extrabold">
											{money(w.priceMinor, w.currency)}
										</p>
										{w.hoursOfWork !== null && (
											<p className="inline-flex items-center gap-1.5 text-[0.88rem] text-ink-soft">
												<Clock className="size-3.5" aria-hidden="true" /> About{" "}
												{w.hoursOfWork} hours of work
											</p>
										)}
									</div>
									<div className="flex w-full flex-wrap gap-2 sm:w-auto">
										{ready ? (
											<>
												<button
													type="button"
													onClick={() => void decide(w, "skipped")}
													className={buttonClass("coin", "md")}
												>
													Skip it
												</button>
												<button
													type="button"
													onClick={() => void decide(w, "bought")}
													className={buttonClass(
														"ghost",
														"md",
														"border-2 border-line",
													)}
												>
													Still want it
												</button>
											</>
										) : (
											<button
												type="button"
												onClick={() => void decide(w, "skipped")}
												className={buttonClass(
													"ghost",
													"md",
													"border-2 border-line",
												)}
											>
												Skip now
											</button>
										)}
									</div>
								</motion.li>
							);
						})}
					</AnimatePresence>
				</ul>
			)}
			{data.decided.length > 0 && (
				<details className="rounded-panel border border-line bg-surface p-4">
					<summary className="cursor-pointer font-semibold">
						Earlier decisions
					</summary>
					<ul className="mt-2 divide-y divide-line">
						{data.decided.map((w) => (
							<li
								key={w.id}
								className="flex flex-wrap justify-between gap-x-4 py-2"
							>
								<span className="break-words">{w.name}</span>
								<span
									className={
										w.decision === "skipped"
											? "font-semibold text-safe"
											: "text-ink-soft"
									}
								>
									{w.decision === "skipped"
										? `Skipped, ${money(w.priceMinor, w.currency)} kept`
										: "Bought"}
								</span>
							</li>
						))}
					</ul>
				</details>
			)}
			<AddWish
				open={adding}
				onClose={() => setAdding(false)}
				currency={data.currency}
			/>
		</section>
	);
}
