import {
	type Db,
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
import { eq } from "drizzle-orm";
import type { SendEmail } from "../email/outbox";
import type { UnsubscribeLinks } from "./unsubscribe";

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
}) {
	const { db } = deps;

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
			if (notice.group && !p[notice.group]) return "off";
			// Claimed before sending, so two ticks can't both send it.
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
			return "sent";
		},
	};
}

export type Notifier = ReturnType<typeof createNotifier>;
