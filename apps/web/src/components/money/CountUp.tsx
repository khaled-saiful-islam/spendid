import { formatMinor } from "@spendid/shared";
import {
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "motion/react";
import { useEffect } from "react";

interface CountUpProps {
	minor: number;
	currency: string;
	locale?: string;
	from?: number;
	className?: string;
}

/** A money amount that rolls to its new value whenever it changes. */
export function CountUp({
	minor,
	currency,
	locale,
	from = 0,
	className,
}: CountUpProps) {
	const reduce = useReducedMotion();
	const value = useMotionValue(reduce ? minor : from);
	const text = useTransform(value, (v) =>
		formatMinor(Math.round(v), currency, locale),
	);

	useEffect(() => {
		const controls = animate(value, minor, {
			duration: reduce ? 0 : 0.9,
			ease: [0.22, 1, 0.36, 1],
		});
		return () => controls.stop();
	}, [minor, reduce, value]);

	return (
		<motion.span className={className} aria-live="polite">
			{text}
		</motion.span>
	);
}
