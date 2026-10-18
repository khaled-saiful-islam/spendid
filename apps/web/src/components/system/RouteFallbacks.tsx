import { Link, useRouter } from "@tanstack/react-router";
import { MapPinOff, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useCallback, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui/Button";
import { t } from "@/i18n";
import { useAutoRetry } from "@/lib/auto-retry";
import { useOnline } from "@/lib/online";
import { ConnectionScene } from "./ConnectionScene";

/** A retry that succeeds at once still shows the plug going in. */
const MIN_TRY_MS = 1200;

/** Asks the server first, so a failed try keeps this page (and its growing wait) in place. */
async function serverAnswers(): Promise<boolean> {
	try {
		const res = await fetch("/api/health", { cache: "no-store" });
		return res.ok;
	} catch {
		return false;
	}
}

function Frame({
	art,
	title,
	body,
	children,
}: {
	art: ReactNode;
	title: string;
	body: string;
	children: ReactNode;
}) {
	return (
		<div className="bg-scales grid min-h-dvh place-items-center px-6 py-10">
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				className="w-full max-w-sm text-center"
			>
				<Logo className="justify-center" />
				<div className="mt-8">{art}</div>
				<h1 className="mt-6 text-[2rem] font-extrabold">{title}</h1>
				<p className="mt-2 text-ink-soft">{body}</p>
				<div className="mt-8 flex flex-wrap justify-center gap-2">
					{children}
				</div>
			</motion.div>
		</div>
	);
}

/** Below the button: what happens next, live. */
function NextTry({
	online,
	busy,
	left,
	total,
}: {
	online: boolean;
	busy: boolean;
	left: number | null;
	total: number;
}) {
	return (
		<div className="mt-1 w-full">
			<p role="status" className="sr-only">
				{busy
					? t("Reconnecting…")
					: online
						? ""
						: t("Waiting for a connection")}
			</p>
			<p
				aria-hidden="true"
				className="inline-flex items-center gap-2 text-[0.92rem] font-semibold text-ink-soft"
			>
				<span
					className={
						busy
							? "size-2 animate-ping rounded-full bg-jade"
							: online
								? "size-2 rounded-full bg-marigold"
								: "size-2 animate-pulse rounded-full bg-coral"
					}
				/>
				{busy
					? t("Reconnecting…")
					: online && left !== null
						? t("Trying again in {n}s", { n: left })
						: t("Waiting for a connection")}
			</p>
			{online && !busy && left !== null && (
				<div className="mx-auto mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-surface-2">
					<motion.div
						className="h-full rounded-full bg-marigold"
						initial={{ width: "100%" }}
						animate={{ width: "0%" }}
						transition={{ duration: total, ease: "linear" }}
					/>
				</div>
			)}
		</div>
	);
}

/**
 * Shown when a page can't load: the connection dropped or the server is restarting. Says
 * which, retries by itself on a countdown, and straight away when the connection is back.
 */
export function RouteError() {
	const router = useRouter();
	const online = useOnline();
	const [busy, setBusy] = useState(false);

	const retry = useCallback(async () => {
		setBusy(true);
		try {
			const [up] = await Promise.all([
				serverAnswers(),
				new Promise((done) => setTimeout(done, MIN_TRY_MS)),
			]);
			if (up) await router.invalidate().catch(() => undefined);
		} finally {
			setBusy(false);
		}
	}, [router]);

	const { left, total } = useAutoRetry(retry, online, busy);

	return (
		<Frame
			art={
				<ConnectionScene
					mode={busy ? "trying" : online ? "server" : "offline"}
				/>
			}
			title={online ? t("Can't reach Spendid") : t("You're offline")}
			body={
				online
					? t(
							"Your connection works, but Spendid isn't answering. Your data is safe.",
						)
					: t(
							"Your data is safe. Spendid reconnects by itself when your connection is back.",
						)
			}
		>
			<button
				type="button"
				onClick={() => void retry()}
				disabled={busy}
				className={buttonClass("coin", "lg")}
			>
				<RotateCcw className="size-5" aria-hidden="true" /> {t("Try again")}
			</button>
			<NextTry online={online} busy={busy} left={left} total={total} />
		</Frame>
	);
}

export function RouteNotFound() {
	return (
		<Frame
			art={
				<div className="mx-auto grid size-20 place-items-center rounded-full bg-surface text-plum-500 shadow-lift">
					<MapPinOff className="size-9" aria-hidden="true" />
				</div>
			}
			title={t("Nothing here")}
			body={t("That page doesn't exist, or it moved.")}
		>
			<Link to="/app" className={buttonClass("coin", "lg")}>
				{t("Go home")}
			</Link>
		</Frame>
	);
}
