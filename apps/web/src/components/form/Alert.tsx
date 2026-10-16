import { CircleAlert, CircleCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface AlertProps {
	tone: "error" | "success";
	children: ReactNode;
}

/** Inline message that slides in; announced to screen readers. */
export function Alert({ tone, children }: AlertProps) {
	const Icon = tone === "error" ? CircleAlert : CircleCheck;
	return (
		<motion.div
			role={tone === "error" ? "alert" : "status"}
			initial={{ opacity: 0, y: -6, height: 0 }}
			animate={{ opacity: 1, y: 0, height: "auto" }}
			exit={{ opacity: 0, height: 0 }}
			className={cn(
				"flex gap-3 overflow-hidden rounded-tile px-4 py-3 text-[0.95rem]",
				tone === "error" ? "bg-coral/12 text-over" : "bg-jade/12 text-safe",
			)}
		>
			<Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
			<div className="min-w-0 flex-1">{children}</div>
		</motion.div>
	);
}

/** Renders an Alert only when there is a message. */
export function MaybeAlert({
	tone,
	message,
	children,
}: {
	tone: AlertProps["tone"];
	message?: string | null;
	children?: ReactNode;
}) {
	return (
		<AnimatePresence>
			{message && (
				<Alert tone={tone}>
					{message}
					{children}
				</Alert>
			)}
		</AnimatePresence>
	);
}
