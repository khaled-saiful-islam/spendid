import {
	House,
	type LucideIcon,
	PiggyBank,
	ReceiptText,
	UsersRound,
} from "lucide-react";

export interface NavItem {
	to: "/app" | "/app/activity" | "/app/plan" | "/app/family";
	label: string;
	icon: LucideIcon;
}

/** Order matters: on phones the + button sits between the 2nd and 3rd items. Me lives in the header. */
export const NAV_ITEMS: NavItem[] = [
	{ to: "/app", label: "Home", icon: House },
	{ to: "/app/activity", label: "Activity", icon: ReceiptText },
	{ to: "/app/plan", label: "Plan", icon: PiggyBank },
	{ to: "/app/family", label: "Family", icon: UsersRound },
];
