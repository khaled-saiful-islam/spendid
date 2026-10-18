import {
	Baby,
	Bus,
	Car,
	Coins,
	Dumbbell,
	FileText,
	Fuel,
	Gift,
	GraduationCap,
	HandHeart,
	HeartPulse,
	House,
	Landmark,
	Laptop,
	type LucideIcon,
	PawPrint,
	Plane,
	ReceiptText,
	Repeat,
	Shapes,
	ShieldCheck,
	ShoppingBag,
	ShoppingBasket,
	Smartphone,
	Sparkles,
	Ticket,
	UtensilsCrossed,
	Wrench,
} from "lucide-react";
import { cn } from "@/lib/cn";

/** Explicit map keeps the bundle small (no "import every icon"). */
const ICONS: Record<string, LucideIcon> = {
	Baby,
	Bus,
	Car,
	Coins,
	Dumbbell,
	FileText,
	Fuel,
	Gift,
	GraduationCap,
	HandHeart,
	HeartPulse,
	House,
	Landmark,
	Laptop,
	PawPrint,
	Plane,
	ReceiptText,
	Repeat,
	Shapes,
	ShieldCheck,
	ShoppingBag,
	ShoppingBasket,
	Smartphone,
	Sparkles,
	Ticket,
	UtensilsCrossed,
	Wrench,
};

/** Each category's own gradient — the colour carries meaning across the app. */
export const TINTS: Record<string, string> = {
	orange: "from-orange-300 to-rose-400",
	lime: "from-lime-300 to-emerald-500",
	sky: "from-sky-300 to-indigo-400",
	amber: "from-amber-200 to-orange-400",
	teal: "from-teal-300 to-cyan-500",
	rose: "from-rose-300 to-red-400",
	pink: "from-pink-300 to-fuchsia-500",
	violet: "from-violet-300 to-purple-500",
	indigo: "from-indigo-300 to-violet-500",
	cyan: "from-cyan-300 to-sky-500",
	blue: "from-blue-300 to-indigo-500",
	fuchsia: "from-fuchsia-300 to-pink-500",
	red: "from-red-300 to-rose-500",
	purple: "from-purple-300 to-fuchsia-500",
	slate: "from-slate-300 to-slate-500",
};

interface CategoryIconProps {
	icon?: string;
	tint?: string;
	size?: "sm" | "md" | "lg";
	className?: string;
}

const SIZES = {
	sm: "size-8 [&_svg]:size-4",
	md: "size-11 [&_svg]:size-5",
	lg: "size-14 [&_svg]:size-7",
};

export function CategoryIcon({
	icon,
	tint,
	size = "md",
	className,
}: CategoryIconProps) {
	const Icon = (icon && ICONS[icon]) || Shapes;
	return (
		<span
			className={cn(
				"grid shrink-0 place-items-center rounded-full bg-linear-to-br text-plum-900 shadow-sm",
				TINTS[tint ?? "slate"] ?? TINTS.slate,
				SIZES[size],
				className,
			)}
			aria-hidden="true"
		>
			<Icon strokeWidth={2.2} />
		</span>
	);
}
