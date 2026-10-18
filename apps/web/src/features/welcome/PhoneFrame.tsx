import { motion, useReducedMotion } from "motion/react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme";

/** The real Spendid app in a phone, in the visitor's own theme: this is what they install. */
export function PhoneFrame({ className }: { className?: string }) {
	const reduce = useReducedMotion();
	const { theme } = useTheme();
	return (
		<motion.figure
			className={cn("relative mx-auto w-[min(17rem,72vw)]", className)}
			initial={reduce ? false : { opacity: 0, y: 30, rotate: -2 }}
			animate={{ opacity: 1, y: 0, rotate: -3 }}
			transition={{ delay: 0.2, type: "spring", stiffness: 90, damping: 16 }}
		>
			<div className="rounded-[2.6rem] bg-plum-950 p-[0.55rem] shadow-[0_40px_80px_-30px_rgb(23_11_38/0.55)] ring-1 ring-black/5 dark:ring-white/25">
				<div className="relative overflow-hidden rounded-[2.1rem] bg-bg">
					<span
						aria-hidden="true"
						className="absolute top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-plum-950"
					/>
					<img
						src={
							theme === "dark"
								? "/landing/app-dark.jpg"
								: "/landing/app-light.jpg"
						}
						alt={t(
							"Spendid's home screen: safe to spend today, the last 7 days and colour tiles",
						)}
						width={390}
						height={844}
						className="block h-auto w-full"
					/>
				</div>
			</div>
		</motion.figure>
	);
}
