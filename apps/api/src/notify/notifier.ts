import {
	type Db,
	inAppNotice,
	notificationLog,
	notificationPref,
	profile,
	user,
} from "@spendid/db";
import type { NoticeKind } from "@spendid/emails";
import {
	DEFAULT_PREFS,
	type EmailGroup,
	formatMinor,
	type NotificationPrefs,
	NotificationPrefsSchema,
	quietDelayMs,
} from "@spendid/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { SendEmail } from "../email/outbox";
import type { Push } from "./push";
import type { UnsubscribeLinks } from "./unsubscribe";

/** Alerts kept in the bell. */
const INBOX_SIZE = 40;

export interface NoticeContent {
	subject: string;
	preview: string;
	heading: string;
	body: string;
	rows?: { label: string; value: string }[];
	action: string;
	url: string;
	footnote?: string;
}

export interface NoticeContext {
	/** Money as text, or "RM •••" when the person hides amounts in email. */
	money: (minor: number, currency: string) => string;
	hidden: boolean;
	appUrl: string;
}

export interface Notice {
	kind: NoticeKind;
	/** null: account and security emails, which always go out. */
	group: EmailGroup | null;
	/** Same kind + key never sends twice (e.g. a budget alert per category per month). */
	dedupeKey?: string;
	/** Security emails skip quiet hours. */
	urgent?: boolean;
	build: (ctx: NoticeContext) => NoticeContent;
}

export type NotifyResult = "sent" | "off" | "already" | "nobody";

/** Local hour, minute, weekday (0 Sun), day of month and date in a time zone. */
export function localParts(timeZone: string, at = new Date()) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", {
			timeZone,
			hour: "2-digit",
			minute: "2-digit",
			weekday: "short",
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hourCycle: "h23",
		})
			.formatToParts(at)
			.map((p) => [p.type, p.value]),
	);
	const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return {
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		weekday: weekdays.indexOf(parts.weekday ?? "Sun"),
		day: Number(parts.day),
		date: `${parts.year}-${parts.month}-${parts.day}`,
	};
}

const mask = (currency: string) =>
	`${formatMinor(0, currency).replace(/[\d.,\s]/g, "")} •••`;

/**
 * Every optional email goes through here: preferences, never-twice, quiet hours, hidden
 * amounts and an unsubscribe link. Admin accounts only ever get account emails.
 */
export function createNotifier(deps: {
	db: Db;
	sendEmail: SendEmail;
	links: UnsubscribeLinks;
	appUrl: string;
	/** Live update to the person's open apps, so the bell's count changes at once. */
	publish?: (userId: string, event: { type: "notices" }) => Promise<unknown>;
	/** Phone notifications, for the people who turned them on. */
	push?: Pick<Push, "deliver">;
}) {
	const { db } = deps;

	/** The in-app copy of an alert: what the bell shows. */
	async function toInbox(
		userId: string,
		kind: string,
		content: { subject: string; preview: string; url?: string },
	): Promise<string | null> {
		const url = content.url;
		const path = url?.startsWith(deps.appUrl)
			? url.slice(deps.appUrl.length) || "/app"
			: null;
		await db.insert(inAppNotice).values({
			userId,
			kind,
			title: content.subject,
			body: content.preview,
			path,
		});
		await deps.publish?.(userId, { type: "notices" }).catch(() => undefined);
		return path;
	}

	async function prefs(userId: string): Promise<NotificationPrefs> {
		const [row] = await db
			.select()
			.from(notificationPref)
			.where(eq(notificationPref.userId, userId))
			.limit(1);
		if (!row) return DEFAULT_PREFS;
		const { userId: _u, updatedAt: _t, ...rest } = row;
		return NotificationPrefsSchema.parse(rest);
	}

	async function setPrefs(
		userId: string,
		raw: unknown,
	): Promise<NotificationPrefs> {
		const next = NotificationPrefsSchema.parse({
			...(await prefs(userId)),
			...(raw as object),
		});
		await db
			.insert(notificationPref)
			.values({ userId, ...next })
			.onConflictDoUpdate({ target: notificationPref.userId, set: next });
		return next;
	}

	return {
		prefs,
		setPrefs,

		async unsubscribe(userId: string, group: EmailGroup): Promise<void> {
			await setPrefs(userId, { [group]: false });
		},

		async notify(userId: string, notice: Notice): Promise<NotifyResult> {
			const [who] = await db
				.select({
					email: user.email,
					name: user.name,
					role: user.role,
					banned: user.banned,
					timeZone: profile.timeZone,
				})
				.from(user)
				.leftJoin(profile, eq(profile.userId, user.id))
				.where(eq(user.id, userId))
				.limit(1);
			if (!who || who.banned) return "nobody";
			if (who.role === "admin" && notice.group !== null) return "nobody";
			const p = await prefs(userId);
			// Claimed before sending, so two ticks can't both send it (or post it twice).
			let claimId: string | undefined;
			if (notice.dedupeKey) {
				const [inserted] = await db
					.insert(notificationLog)
					.values({ userId, kind: notice.kind, dedupeKey: notice.dedupeKey })
					.onConflictDoNothing()
					.returning({ id: notificationLog.id });
				if (!inserted) return "already";
				claimId = inserted.id;
			}
			const content = notice.build({
				hidden: p.hideAmounts,
				money: (minor, currency) =>
					p.hideAmounts ? mask(currency) : formatMinor(minor, currency),
				appUrl: deps.appUrl,
			});
			// Email off for this kind: it still reaches the in-app inbox.
			if (notice.group && !p[notice.group]) {
				await toInbox(userId, notice.kind, content);
				return "off";
			}
			const delayMs = notice.urgent
				? 0
				: quietDelayMs(
						localParts(who.timeZone ?? "UTC"),
						p.quietStart,
						p.quietEnd,
					);
			const job = deps.sendEmail(
				{
					type: "notice",
					kind: notice.kind,
					to: who.email,
					name: who.name,
					userId,
					unsubscribeUrl: notice.group
						? deps.links.url(userId, notice.group)
						: undefined,
					...content,
					rows: content.rows ?? [],
					footnote: content.footnote ?? "",
				},
				{ delayMs },
			);
			try {
				await job;
			} catch (err) {
				// Not queued: give the claim back, so the next try can send it.
				if (claimId)
					await db
						.delete(notificationLog)
						.where(eq(notificationLog.id, claimId));
				throw err;
			}
			const path = await toInbox(userId, notice.kind, content);
			// The phone buzzes with the email, but never in quiet hours (the bell still has it).
			if (delayMs === 0)
				await deps.push
					?.deliver(userId, {
						title: content.subject,
						body: content.preview,
						path,
					})
					.catch(() => undefined);
			return "sent";
		},

		/** The latest alerts for the bell, newest first, and how many are unread. */
		async inbox(userId: string) {
			const items = await db
				.select({
					id: inAppNotice.id,
					kind: inAppNotice.kind,
					title: inAppNotice.title,
					body: inAppNotice.body,
					path: inAppNotice.path,
					createdAt: inAppNotice.createdAt,
					readAt: inAppNotice.readAt,
				})
				.from(inAppNotice)
				.where(eq(inAppNotice.userId, userId))
				.orderBy(desc(inAppNotice.createdAt), desc(inAppNotice.id))
				.limit(INBOX_SIZE);
			const [row] = await db
				.select({ unread: sql<number>`count(*)::int` })
				.from(inAppNotice)
				.where(and(eq(inAppNotice.userId, userId), isNull(inAppNotice.readAt)));
			return {
				unread: row?.unread ?? 0,
				items: items.map((i) => ({
					...i,
					createdAt: i.createdAt.toISOString(),
					read: i.readAt !== null,
					readAt: undefined,
				})),
			};
		},

		async markRead(userId: string): Promise<void> {
			await db
				.update(inAppNotice)
				.set({ readAt: new Date() })
				.where(and(eq(inAppNotice.userId, userId), isNull(inAppNotice.readAt)));
		},
	};
}

export type Notifier = ReturnType<typeof createNotifier>;
