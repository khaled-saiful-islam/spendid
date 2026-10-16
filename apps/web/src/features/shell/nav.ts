import {
	House,
	type LucideIcon,
	ReceiptText,
	Sparkles,
	Target,
	UsersRound,
} from "lucide-react";

export interface NavItem {
	to: "/app" | "/app/activity" | "/app/plan" | "/app/family" | "/app/ask";
	label: string;
	icon: LucideIcon;
}

/** Order matters: on phones the + button sits between the 2nd and 3rd items. Me lives in the header. */
export const NAV_ITEMS: NavItem[] = [
	{ to: "/app", label: "Home", icon: House },
	{ to: "/app/activity", label: "Activity", icon: ReceiptText },
	{ to: "/app/plan", label: "Plan", icon: Target },
	{ to: "/app/family", label: "Family", icon: UsersRound },
];

/** Desktop sidebar extras (on phones Ask sits in the header). */
export const ASK_ITEM: NavItem = {
	to: "/app/ask",
	label: "Ask Spendid",
	icon: Sparkles,
};
