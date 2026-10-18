import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@spendid/db";
import {
	AcceptInviteSchema,
	FAMILY_EVENT,
	type FamilyEvent,
	type FamilyOverview,
	INVITE_DAYS,
	type InviteCreated,
	type InviteInput,
	InviteInputSchema,
	type InvitePreview,
	LEVEL_INFO,
	levelIncludes,
	MAX_CIRCLE,
	RELATION_LABELS,
	type SharedView,
	type ShareState,
	type ShareUpdate,
	ShareUpdateSchema,
} from "@spendid/shared";
import type { SendEmail } from "../../email/outbox";
import { AppError, badRequest, notFound } from "../../http/app-error";
import type { FamilyRepository } from "./family.repository";
import { buildSharedView, isSharedReceipt } from "./shared-view";

const DAY_MS = 86_400_000;
const MAX_PENDING = 10;
const MAX_INVITES_PER_DAY = 20;
/** Share changes within this window only notify in the app, not by email again. */
export const EMAIL_QUIET_MS = 10 * 60_000;

export type Publish = (userId: string, event: unknown) => Promise<unknown>;

interface Deps {
	db: Db;
	repo: FamilyRepository;
	sendEmail: SendEmail;
	publish: Publish;
	appUrl: string;
	receiptImage: (
		ownerId: string,
		receiptId: string,
	) => Promise<{ bytes: Buffer; mime: string }>;
	/** Email preferences: family emails only go to people who want them, with a way out. */
	familyEmail?: {
		wanted: (userId: string) => Promise<boolean>;
		unsubscribeUrl: (userId: string) => string;
	};
	/** True at most once per key per EMAIL_QUIET_MS (Redis SET NX PX in the app). */
	allowEmail: (key: string) => Promise<boolean>;
}

export const hashToken = (token: string): string =>
	createHash("sha256").update(token).digest("hex");

const isUniqueViolation = (err: unknown): boolean =>
	typeof err === "object" &&
	err !== null &&
	"code" in err &&
	(err as { code?: string }).code === "23505";

/** Invites, consent and what each person shares. Both sides always know what's shared. */
export function createFamilyService(deps: Deps) {
	const { db, repo } = deps;
	const familyUrl = `${deps.appUrl}/app/family`;

	const tell = (userId: string, what: FamilyEvent["what"], message?: string) =>
		deps
			.publish(userId, {
				type: FAMILY_EVENT,
				what,
				message,
			} satisfies FamilyEvent)
			.catch(() => undefined);

	async function mustBeConnected(a: string, b: string): Promise<void> {
		if (!(await repo.isConnected(a, b)))
			throw notFound("Person in your circle");
	}

	async function emailChange(userId: string, change: string): Promise<void> {
		const to = await repo.contact(userId);
		if (!to) return;
		if (deps.familyEmail && !(await deps.familyEmail.wanted(to.id))) return;
		await deps.sendEmail({
			type: "family-share-changed",
			to: to.email,
			name: to.name,
			userId: to.id,
			change,
			url: familyUrl,
			unsubscribeUrl: deps.familyEmail?.unsubscribeUrl(to.id),
		});
	}

	function describeChange(
		name: string,
		before: ShareState | null,
		after: ShareUpdate,
	): string | null {
		const label = LEVEL_INFO[after.level].label.toLowerCase();
		if (after.paused && !before?.paused)
			return `${name} paused sharing with you.`;
		if (after.level === "none" && before?.level !== "none")
			return `${name} now shares nothing with you.`;
		if (!after.paused && before?.paused)
			return `${name} is sharing with you again: ${label}.`;
		if (!after.paused && before?.level !== after.level)
			return `${name} now shares ${label} with you.`;
		return null;
	}

	async function inviteState(
		row: NonNullable<Awaited<ReturnType<FamilyRepository["inviteByHash"]>>>,
		viewerId: string | null,
	): Promise<InvitePreview["state"]> {
		const { invite } = row;
		if (invite.acceptedAt || invite.revokedAt || row.banned) return "used";
		if (invite.expiresAt.getTime() < Date.now()) return "expired";
		if (viewerId === invite.inviterId) return "yours";
		if (viewerId && (await repo.isConnected(viewerId, invite.inviterId)))
			return "connected";
		// An invite sent to an email is for that person only, not whoever got the link.
		if (viewerId && invite.email) {
			const viewer = await repo.contact(viewerId);
			if (viewer?.email.toLowerCase() !== invite.email.toLowerCase())
				return "someone-else";
		}
		return "ok";
	}

	return {
		async overview(userId: string): Promise<FamilyOverview> {
			const [people, invites] = await Promise.all([
				repo.people(userId),
				repo.pendingInvites(userId),
			]);
			return { people, invites };
		},

		async createInvite(
			userId: string,
			raw: InviteInput,
		): Promise<InviteCreated> {
			const input = InviteInputSchema.parse(raw);
			const me = await repo.contact(userId);
			if (!me) throw notFound("Account");
			if (input.email && input.email.toLowerCase() === me.email.toLowerCase())
				throw badRequest(
					"That's your own email. Use the email of the person you're inviting.",
				);
			const [pending, today, size] = await Promise.all([
				repo.pendingInvites(userId),
				repo.invitesSince(userId, new Date(Date.now() - DAY_MS)),
				repo.circleSize(userId),
			]);
			if (size >= MAX_CIRCLE)
				throw badRequest(`A circle can have up to ${MAX_CIRCLE} people.`);
			if (pending.length >= MAX_PENDING)
				throw badRequest(
					"You have lots of open invites. Cancel one before making another.",
				);
			if (today >= MAX_INVITES_PER_DAY)
				throw new AppError(
					429,
					"That's a lot of invites today. Try again tomorrow.",
				);

			const token = randomBytes(24).toString("base64url");
			const invite = await repo.createInvite({
				inviterId: userId,
				tokenHash: hashToken(token),
				relation: input.relation,
				level: input.level,
				email: input.email ?? null,
				expiresAt: new Date(Date.now() + INVITE_DAYS * DAY_MS),
			});
			const url = `${deps.appUrl}/join/${token}`;
			if (input.email) {
				await deps.sendEmail({
					type: "family-invite",
					to: input.email,
					name: "there",
					inviterName: me.name,
					relation: RELATION_LABELS[input.relation],
					url,
				});
			}
			return { invite, url };
		},

		async revokeInvite(userId: string, id: string): Promise<void> {
			if (!(await repo.revokeInvite(userId, id))) throw notFound("Invite");
		},

		/** Safe to show before signing in: the inviter's name and offer, never money. */
		async previewInvite(
			token: string,
			viewerId: string | null,
		): Promise<InvitePreview> {
			const row = await repo.inviteByHash(hashToken(token));
			if (!row) throw notFound("Invite");
			return {
				inviterName: row.inviterName,
				relation: row.invite.relation,
				level: row.invite.level,
				expiresAt: row.invite.expiresAt.toISOString(),
				state: await inviteState(row, viewerId),
			};
		},

		/** The second "yes": the invitee picks what they share back, then both are connected. */
		async acceptInvite(
			userId: string,
			token: string,
			raw: unknown,
		): Promise<void> {
			const { level } = AcceptInviteSchema.parse(raw);
			const found = await repo.inviteByHash(hashToken(token));
			if (!found) throw notFound("Invite");
			const state = await inviteState(found, userId);
			if (state === "yours")
				throw badRequest(
					"You can't join your own invite. Send the link to someone else.",
				);
			if (state === "connected")
				throw badRequest("You're already in each other's circle.");
			if (state === "someone-else")
				throw new AppError(
					403,
					"This invite was sent to a different email. Sign in with that email, or ask for a new link.",
				);
			if (state !== "ok")
				throw badRequest(
					"This invite has expired or was already used. Ask for a new link.",
				);
			const inviterId = found.invite.inviterId;

			try {
				await db.transaction(async (tx) => {
					const invite = await repo.lockInvite(tx, found.invite.id);
					if (!invite || invite.acceptedAt || invite.revokedAt)
						throw badRequest(
							"This invite was already used. Ask for a new link.",
						);
					const [mineSize, theirSize] = await Promise.all([
						repo.circleSize(userId, tx),
						repo.circleSize(inviterId, tx),
					]);
					if (mineSize >= MAX_CIRCLE || theirSize >= MAX_CIRCLE)
						throw badRequest(`A circle can have up to ${MAX_CIRCLE} people.`);
					await repo.connect(tx, inviterId, userId, invite.relation);
					await repo.setGrant(inviterId, userId, invite.level, false, tx);
					await repo.setGrant(userId, inviterId, level, false, tx);
					await repo.markAccepted(tx, invite.id, userId);
				});
			} catch (err) {
				if (isUniqueViolation(err))
					throw badRequest("You're already in each other's circle.");
				throw err;
			}

			const [me, inviter] = await Promise.all([
				repo.contact(userId),
				repo.contact(inviterId),
			]);
			if (me && inviter) {
				await tell(inviterId, "circle", `${me.name} joined your circle.`);
				if (!deps.familyEmail || (await deps.familyEmail.wanted(inviter.id)))
					await deps.sendEmail({
						type: "family-joined",
						to: inviter.email,
						name: inviter.name,
						userId: inviter.id,
						joinerName: me.name,
						url: familyUrl,
						unsubscribeUrl: deps.familyEmail?.unsubscribeUrl(inviter.id),
					});
			}
		},

		async updateShare(
			userId: string,
			otherId: string,
			raw: ShareUpdate,
		): Promise<ShareState> {
			const input = ShareUpdateSchema.parse(raw);
			await mustBeConnected(userId, otherId);
			const before = await repo.grant(userId, otherId);
			await repo.setGrant(userId, otherId, input.level, input.paused);
			const after = await repo.grant(userId, otherId);
			if (!after) throw new Error("grant vanished after update");

			const me = await repo.contact(userId);
			const change = describeChange(me?.name ?? "Someone", before, input);
			if (change) {
				await tell(otherId, "share", change);
				if (await deps.allowEmail(`share:${userId}:${otherId}`))
					await emailChange(otherId, change);
			}
			return after;
		},

		/** Stop: ends the connection for both people and removes everything shared. */
		async leave(userId: string, otherId: string): Promise<void> {
			const me = await repo.contact(userId);
			if (!(await repo.disconnect(userId, otherId)))
				throw notFound("Person in your circle");
			const change = `${me?.name ?? "Someone"} left your family circle. Nothing is shared between you any more.`;
			await tell(otherId, "circle", change);
			await emailChange(otherId, change);
		},

		/** What `ownerId` lets me see. */
		async viewOf(viewerId: string, ownerId: string): Promise<SharedView> {
			await mustBeConnected(viewerId, ownerId);
			const grant = await repo.grant(ownerId, viewerId);
			if (!grant) throw notFound("Shared money");
			return buildSharedView(db, ownerId, grant);
		},

		/** "What they see": my money exactly as `viewerId` sees it. */
		async previewFor(ownerId: string, viewerId: string): Promise<SharedView> {
			await mustBeConnected(ownerId, viewerId);
			const grant = await repo.grant(ownerId, viewerId);
			if (!grant) throw notFound("Shared money");
			return buildSharedView(db, ownerId, grant);
		},

		async receiptImage(viewerId: string, ownerId: string, receiptId: string) {
			await mustBeConnected(viewerId, ownerId);
			const grant = await repo.grant(ownerId, viewerId);
			const allowed =
				grant &&
				!grant.paused &&
				levelIncludes(grant.level, "receipts") &&
				(await isSharedReceipt(db, ownerId, receiptId));
			if (!allowed) throw notFound("Receipt");
			return deps.receiptImage(ownerId, receiptId);
		},
	};
}

export type FamilyService = ReturnType<typeof createFamilyService>;
