import {
	CircleUserRound,
	House,
	type LucideIcon,
	ReceiptText,
	UsersRound,
} from "lucide-react";

export interface NavItem {
	to: "/app" | "/app/activity" | "/app/family" | "/app/me";
	label: string;
	icon: LucideIcon;
}

/** Order matters: on phones the + button sits between the 2nd and 3rd items. */
export const NAV_ITEMS: NavItem[] = [
	{ to: "/app", label: "Home", icon: House },
	{ to: "/app/activity", label: "Activity", icon: ReceiptText },
	{ to: "/app/family", label: "Family", icon: UsersRound },
	{ to: "/app/me", label: "Me", icon: CircleUserRound },
];
