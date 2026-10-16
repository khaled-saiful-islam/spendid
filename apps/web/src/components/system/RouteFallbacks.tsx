import { Link, useRouter } from "@tanstack/react-router";
import { CloudOff, MapPinOff, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui/Button";

function Frame({
	icon,
	title,
	body,
	children,
}: {
	icon: ReactNode;
	title: string;
	body: string;
	children: ReactNode;
}) {
	return (
		<div className="bg-scales grid min-h-dvh place-items-center px-6">
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				className="w-full max-w-sm text-center"
			>
				<Logo className="justify-center" />
				<div className="mx-auto mt-10 grid size-20 place-items-center rounded-full bg-surface shadow-lift text-plum-500">
					{icon}
				</div>
				<h1 className="mt-6 text-[2rem] font-extrabold">{title}</h1>
				<p className="mt-2 text-ink-soft">{body}</p>
				<div className="mt-8 flex flex-wrap justify-center gap-2">
					{children}
				</div>
			</motion.div>
		</div>
	);
}

/** Shown when a page can't load — usually the server is restarting or the connection dropped. */
export function RouteError() {
	const router = useRouter();
	return (
		<Frame
			icon={<CloudOff className="size-9" aria-hidden="true" />}
			title="Can't reach Spendid"
			body="Your data is safe. Check your connection, then try again."
		>
			<button
				type="button"
				onClick={() => void router.invalidate()}
				className={buttonClass("coin", "lg")}
			>
				<RotateCcw className="size-5" aria-hidden="true" /> Try again
			</button>
		</Frame>
	);
}

export function RouteNotFound() {
	return (
		<Frame
			icon={<MapPinOff className="size-9" aria-hidden="true" />}
			title="Nothing here"
			body="That page doesn't exist, or it moved."
		>
			<Link to="/app" className={buttonClass("coin", "lg")}>
				Go home
			</Link>
		</Frame>
	);
}
