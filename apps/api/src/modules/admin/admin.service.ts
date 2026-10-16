import type { AppSettings, AppSettingsStore } from "@spendid/server";
import type { Auth } from "../../auth/auth";
import type { SendEmail } from "../../email/outbox";
import { AppError, notFound } from "../../http/app-error";
import type { AdminRepository } from "./admin.repository";

interface Deps {
	repo: AdminRepository;
	auth: Auth;
	settings: AppSettingsStore;
	sendEmail: SendEmail;
	appUrl: string;
}

/**
 * Admin actions. Account changes go through Better Auth's admin API (so its permission
 * checks apply), every action is written to the audit log, and admins can't act on
 * themselves or on other admins.
 */
export function createAdminService({
	repo,
	auth,
	settings,
	sendEmail,
	appUrl,
}: Deps) {
	async function target(actorId: string, userId: string) {
		const person = await repo.findUser(userId);
		if (!person) throw notFound("Person");
		if (person.id === actorId)
			throw new AppError(400, "You can't change your own account here.");
		if (person.role === "admin")
			throw new AppError(
				403,
				"Admin accounts can't be changed from the console.",
			);
		return person;
	}

	return {
		overview: async () => ({
			...(await repo.overview()),
			settings: await settings.get(),
		}),

		async pause(
			actorId: string,
			userId: string,
			reason: string | null,
			headers: Headers,
		) {
			const person = await target(actorId, userId);
			await auth.api.banUser({
				body: { userId, banReason: reason ?? "Paused by Spendid" },
				headers,
			});
			await repo.audit({
				actorId,
				action: "account.paused",
				targetUserId: userId,
				targetLabel: person.email,
				detail: { reason },
			});
			await sendEmail({
				type: "account-paused",
				to: person.email,
				name: person.name,
				reason,
				userId,
			});
		},

		async restore(actorId: string, userId: string, headers: Headers) {
			const person = await target(actorId, userId);
			await auth.api.unbanUser({ body: { userId }, headers });
			await repo.audit({
				actorId,
				action: "account.restored",
				targetUserId: userId,
				targetLabel: person.email,
			});
			await sendEmail({
				type: "account-restored",
				to: person.email,
				name: person.name,
				url: `${appUrl}/signin`,
				userId,
			});
		},

		async remove(actorId: string, userId: string, headers: Headers) {
			const person = await target(actorId, userId);
			// Audit first: the row keeps the email as a label after the account is gone.
			await repo.audit({
				actorId,
				action: "account.deleted",
				targetUserId: null,
				targetLabel: person.email,
			});
			await auth.api.removeUser({ body: { userId }, headers });
		},

		async sendReset(actorId: string, userId: string) {
			const person = await target(actorId, userId);
			await auth.api.requestPasswordReset({
				body: { email: person.email, redirectTo: `${appUrl}/reset` },
			});
			await repo.audit({
				actorId,
				action: "account.reset-sent",
				targetUserId: userId,
				targetLabel: person.email,
			});
		},

		async setAi(
			actorId: string,
			userId: string,
			input: { monthlyTokens: number | null; enabled: boolean },
		) {
			const person = await target(actorId, userId);
			await repo.setAiLimit(userId, input.monthlyTokens, input.enabled);
			await repo.audit({
				actorId,
				action: "ai.limit-set",
				targetUserId: userId,
				targetLabel: person.email,
				detail: input,
			});
		},

		async updateSettings(actorId: string, patch: Partial<AppSettings>) {
			const next = await settings.set(patch, actorId);
			await repo.audit({ actorId, action: "settings.updated", detail: patch });
			return next;
		},
	};
}

export type AdminService = ReturnType<typeof createAdminService>;
