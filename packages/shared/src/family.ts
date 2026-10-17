import { z } from "zod";

export const RELATIONS = [
	"spouse",
	"partner",
	"parent",
	"child",
	"sibling",
	"other",
] as const;
export type Relation = (typeof RELATIONS)[number];

/** Each level includes everything before it. */
export const SHARE_LEVELS = [
	"totals",
	"categories",
	"transactions",
	"receipts",
] as const;
export type ShareLevel = (typeof SHARE_LEVELS)[number];

export const REACTIONS = ["👏", "❤️", "😂", "😮", "🙌"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

export const RELATION_LABELS: Record<Relation, string> = {
	spouse: "Spouse",
	partner: "Partner",
	parent: "Parent",
	child: "Child",
	sibling: "Sibling",
	other: "Family",
};

/** What each level lets someone see, in plain words: `sees` for the sharer, `theirs` for the viewer. */
export const LEVEL_INFO: Record<
	ShareLevel,
	{ label: string; sees: string; theirs: string }
> = {
	totals: {
		label: "Totals",
		sees: "How much you spent this month, nothing else.",
		theirs: "How much they spent this month, nothing else.",
	},
	categories: {
		label: "Categories",
		sees: "Totals, plus how much went to food, transport and each category.",
		theirs: "Their totals, plus how much went to each category.",
	},
	transactions: {
		label: "Expenses",
		sees: "Categories, plus each expense: shop, amount and day. Never your notes.",
		theirs: "Each expense with shop, amount and day. Never their notes.",
	},
	receipts: {
		label: "Expenses + receipts",
		sees: "Every expense, plus the receipt photos you saved.",
		theirs: "Every expense, plus the receipt photos they saved.",
	},
};

/** If I call you my parent, you call me your child. */
export function inverseRelation(relation: Relation): Relation {
	if (relation === "parent") return "child";
	if (relation === "child") return "parent";
	return relation;
}

/** True when `level` shows at least as much as `needed`. */
export function levelIncludes(level: ShareLevel, needed: ShareLevel): boolean {
	return SHARE_LEVELS.indexOf(level) >= SHARE_LEVELS.indexOf(needed);
}

/** Invites expire after a week; one link joins one person. */
export const INVITE_DAYS = 7;
export const MAX_CIRCLE = 12;

export const InviteInputSchema = z.object({
	relation: z.enum(RELATIONS, "Pick how you're related"),
	level: z.enum(SHARE_LEVELS, "Pick what you'll share"),
	email: z
		.email("That email doesn't look right")
		.max(254)
		.optional()
		.or(z.literal("").transform(() => undefined)),
});
export type InviteInput = z.input<typeof InviteInputSchema>;

export const AcceptInviteSchema = z.object({
	level: z.enum(SHARE_LEVELS, "Pick what you'll share"),
});

export const ShareUpdateSchema = z.object({
	level: z.enum(SHARE_LEVELS),
	paused: z.boolean(),
});
export type ShareUpdate = z.infer<typeof ShareUpdateSchema>;

export const ReactionInputSchema = z.object({
	kind: z.enum(["expense", "deposit"]),
	targetId: z.uuid(),
	/** null takes the reaction back. */
	emoji: z.enum(REACTIONS).nullable(),
});
export type ReactionInput = z.infer<typeof ReactionInputSchema>;

export const JarMembersSchema = z.object({
	userIds: z.array(z.string().min(1).max(64)).max(MAX_CIRCLE),
});

export const JarDepositSchema = z.object({
	amountMinor: z
		.number()
		.int()
		.refine((n) => n !== 0, "Enter an amount")
		.refine((n) => Math.abs(n) <= 1_000_000_000, "That's too much for one go"),
});

export interface ShareState {
	level: ShareLevel;
	paused: boolean;
	updatedAt: string;
}

export interface FamilyPerson {
	userId: string;
	name: string;
	/** How I describe them. */
	relation: Relation;
	since: string;
	/** What they let me see. */
	theyShare: ShareState | null;
	/** What I let them see. */
	iShare: ShareState | null;
}

export interface PendingInvite {
	id: string;
	relation: Relation;
	level: ShareLevel;
	email: string | null;
	expiresAt: string;
	createdAt: string;
}

export interface FamilyOverview {
	people: FamilyPerson[];
	invites: PendingInvite[];
}

export interface InviteCreated {
	invite: PendingInvite;
	url: string;
}

/** What someone sees before joining: never any money. */
export interface InvitePreview {
	inviterName: string;
	/** How the inviter describes the person joining. */
	relation: Relation;
	/** What the inviter will share. */
	level: ShareLevel;
	expiresAt: string;
	/** "ok" or why it can't be used. */
	/** "someone-else": sent to another email than the viewer's. */
	state: "ok" | "expired" | "used" | "yours" | "connected" | "someone-else";
}

/** Exactly what one person can see of another's money — built the same way for the preview. */
export interface SharedView {
	ownerName: string;
	currency: string;
	level: ShareLevel;
	paused: boolean;
	/** null while paused. */
	month: { spentMinor: number; lastMonthMinor: number; count: number } | null;
	categories:
		| { name: string; icon: string; tint: string; spentMinor: number }[]
		| null;
	expenses:
		| {
				id: string;
				merchant: string | null;
				category: string;
				icon: string;
				tint: string;
				amountMinor: number;
				occurredAt: string;
				receiptId: string | null;
		  }[]
		| null;
}

export interface PulseReaction {
	emoji: string;
	count: number;
	mine: boolean;
	names: string[];
}

export interface PulseItem {
	kind: "expense" | "deposit" | "joined";
	id: string;
	at: string;
	actorId: string;
	actorName: string;
	mine: boolean;
	/** expense: shop or category; deposit: jar name; joined: the other person. */
	title: string;
	/** Category icon name for expenses, an emoji otherwise. */
	icon: string;
	tint: string | null;
	amountMinor: number | null;
	currency: string | null;
	reactions: PulseReaction[];
}

export interface SharedJar {
	id: string;
	name: string;
	emoji: string;
	targetMinor: number;
	savedMinor: number;
	currency: string;
	ownerId: string;
	ownerName: string;
	mine: boolean;
	members: { userId: string; name: string; givenMinor: number }[];
}

export const FAMILY_EVENT = "family";
export const FamilyEventSchema = z.object({
	type: z.literal(FAMILY_EVENT),
	what: z.enum(["circle", "share", "pulse", "jar"]),
	message: z.string().max(200).optional(),
});
export type FamilyEvent = z.infer<typeof FamilyEventSchema>;
