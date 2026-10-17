import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "coin" | "ink" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
	coin: "bg-marigold text-plum-900 shadow-coin hover:bg-marigold-deep",
	ink: "bg-plum-900 text-plum-50 hover:bg-plum-800 dark:bg-plum-50 dark:text-plum-900 dark:hover:bg-white",
	ghost: "bg-transparent text-ink hover:bg-surface-2",
};

const sizes: Record<Size, string> = {
	sm: "h-10 px-4 text-[0.9rem]",
	md: "h-11 px-5 text-[0.95rem]",
	lg: "h-14 px-7 text-[1.05rem]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
}

/** Base styles shared with <Link> elements that should look like buttons. */
export function buttonClass(
	variant: Variant = "coin",
	size: Size = "md",
	extra?: string,
): string {
	return cn(
		"inline-flex items-center justify-center gap-2 rounded-full font-semibold",
		"transition-[transform,background-color] duration-200 active:scale-[0.97]",
		"disabled:pointer-events-none disabled:opacity-50",
		variants[variant],
		sizes[size],
		extra,
	);
}

export function Button({
	variant,
	size,
	className,
	type = "button",
	...rest
}: ButtonProps) {
	return (
		<button
			type={type}
			className={buttonClass(variant, size, className)}
			{...rest}
		/>
	);
}
