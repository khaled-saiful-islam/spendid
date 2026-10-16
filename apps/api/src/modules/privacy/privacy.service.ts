import { type Db, dataExport, receipt, user } from "@spendid/db";
import type { FileStore } from "@spendid/server";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { Auth } from "../../auth/auth";
import type { SendEmail } from "../../email/outbox";
import { AppError, badRequest, notFound } from "../../http/app-error";
import type { Notifier } from "../../notify/notifier";
import { buildArchive } from "./archive";

const EXPORT_HOURS = 24;
const EXPORT_COOLDOWN_MS = 5 * 60_000;

export interface ExportInfo {
	id: string;
	status: "building" | "ready" | "failed";
	bytes: number | null;
	createdAt: string;
	expiresAt: string;
}

export const DeleteAccountSchema = z.object({
	password: z.string().min(1, "Enter your password").max(128),
	confirm: z.literal("DELETE", "Type DELETE to confirm"),
});

const info = (row: typeof dataExport.$inferSelect): ExportInfo => ({
	id: row.id,
	status: row.status,
	bytes: row.bytes,
	createdAt: row.createdAt.toISOString(),
	expiresAt: row.expiresAt.toISOString(),
});

/**
 * Your data, your call: a full export (built in the background, emailed when ready,
 * kept 24 hours) and a full delete that removes every row and every receipt photo.
 */
export function createPrivacyService(deps: {
	db: Db;
	store: FileStore;
	auth: Auth;
	notifier: Notifier;
	sendEmail: SendEmail;
	publish: (userId: string, event: unknown) => Promise<unknown>;
	appUrl: string;
}) {
	const { db, store } = deps;

	/** Drops expired archives (rows and files). Called on every request; cheap. */
	async function sweep(userId: string): Promise<void> {
		const old = await db
			.delete(dataExport)
			.where(
				and(
					eq(dataExport.userId, userId),
					lt(dataExport.expiresAt, new Date()),
				),
			)
			.returning({ fileKey: dataExport.fileKey });
		await Promise.all(
			old.map((o) => (o.fileKey ? store.remove(o.fileKey) : undefined)),
		);
	}

	async function build(
		userId: string,
		id: string,
		log: FastifyBaseLogger,
	): Promise<void> {
		try {
			const zip = await buildArchive(db, store, userId);
			const fileKey = await store.put(userId, Buffer.from(zip));
			await db
				.update(dataExport)
				.set({ status: "ready", fileKey, bytes: zip.byteLength })
				.where(eq(dataExport.id, id));
			await deps
				.publish(userId, { type: "export", id, status: "ready" })
				.catch((err: unknown) =>
					log.warn({ err }, "export: live update failed"),
				);
			await deps.notifier.notify(userId, {
				kind: "export-ready",
				group: null,
				urgent: true,
				dedupeKey: id,
				build: ({ appUrl }) => ({
					subject: "Your Spendid data is ready",
					preview: `Download it within ${EXPORT_HOURS} hours.`,
					heading: "Your export is ready",
					body: `Everything you've put into Spendid is in one file: expenses as a spreadsheet, receipts, goals, family and settings. Sign in to download it. The file is deleted after ${EXPORT_HOURS} hours.`,
					action: "Download my data",
					url: `${appUrl}/app/me`,
					footnote: "If you didn't ask for this, change your password.",
				}),
			});
		} catch (err) {
			log.error({ err, exportId: id }, "export: building the archive failed");
			await db
				.update(dataExport)
				.set({ status: "failed" })
				.where(eq(dataExport.id, id));
			await deps
				.publish(userId, { type: "export", id, status: "failed" })
				.catch((err: unknown) =>
					log.warn({ err }, "export: live update failed"),
				);
		}
	}

	return {
		async latestExport(userId: string): Promise<ExportInfo | null> {
			await sweep(userId);
			const [row] = await db
				.select()
				.from(dataExport)
				.where(eq(dataExport.userId, userId))
				.orderBy(desc(dataExport.createdAt))
				.limit(1);
			return row ? info(row) : null;
		},

		async requestExport(
			userId: string,
			log: FastifyBaseLogger,
		): Promise<ExportInfo> {
			await sweep(userId);
			const [recent] = await db
				.select()
				.from(dataExport)
				.where(
					and(
						eq(dataExport.userId, userId),
						gt(dataExport.createdAt, new Date(Date.now() - EXPORT_COOLDOWN_MS)),
					),
				)
				.limit(1);
			if (recent && recent.status !== "failed") return info(recent);
			const [row] = await db
				.insert(dataExport)
				.values({
					userId,
					expiresAt: new Date(Date.now() + EXPORT_HOURS * 3_600_000),
				})
				.returning();
			if (!row) throw new Error("export insert returned nothing");
			void build(userId, row.id, log);
			return info(row);
		},

		async download(userId: string, id: string): Promise<Buffer> {
			const [row] = await db
				.select()
				.from(dataExport)
				.where(and(eq(dataExport.id, id), eq(dataExport.userId, userId)))
				.limit(1);
			if (row?.status !== "ready" || !row.fileKey || row.expiresAt < new Date())
				throw notFound("Export");
			return store.get(row.fileKey);
		},

		/** Checks the password with Better Auth, deletes everything, then says goodbye by email. */
		async deleteAccount(
			userId: string,
			raw: unknown,
			headers: Headers,
			log: FastifyBaseLogger,
		): Promise<void> {
			const input = DeleteAccountSchema.parse(raw);
			const [person] = await db
				.select({ email: user.email, name: user.name })
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);
			if (!person) throw notFound("Account");
			const files = [
				...(
					await db
						.select({ key: receipt.fileKey })
						.from(receipt)
						.where(eq(receipt.userId, userId))
				).map((r) => r.key),
				...(
					await db
						.select({ key: dataExport.fileKey })
						.from(dataExport)
						.where(eq(dataExport.userId, userId))
				)
					.map((r) => r.key)
					.filter((k): k is string => Boolean(k)),
			];
			try {
				await deps.auth.api.deleteUser({
					body: { password: input.password },
					headers,
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : "";
				if (/password/i.test(message))
					throw badRequest("That password isn't right.");
				throw new AppError(
					400,
					"We couldn't delete the account. Check your password and try again.",
				);
			}
			const removed = await Promise.allSettled(
				files.map((k) => store.remove(k)),
			);
			const left = removed.filter((r) => r.status === "rejected").length;
			if (left > 0)
				log.error({ left }, "account delete: some files could not be removed");
			await deps
				.sendEmail({
					type: "notice",
					kind: "account-deleted",
					to: person.email,
					name: person.name,
					subject: "Your Spendid account is deleted",
					preview: "Everything is gone, as you asked.",
					heading: "Your account is deleted",
					body: "Your account and everything in it (expenses, receipts, goals, family links and settings) has been permanently deleted. Thanks for trying Spendid.",
					rows: [],
					action: "Visit Spendid",
					url: deps.appUrl,
					footnote: "If you didn't do this, reply to this email right away.",
				})
				.catch((err: unknown) =>
					log.warn({ err }, "account delete: goodbye email not queued"),
				);
		},
	};
}

export type PrivacyService = ReturnType<typeof createPrivacyService>;
