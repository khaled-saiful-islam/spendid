import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	Download,
	FileArchive,
	LoaderCircle,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { buttonClass } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/i18n";
import { ApiError, api } from "@/lib/http";
import { formatMoment } from "@/lib/time";

interface ExportInfo {
	id: string;
	status: "building" | "ready" | "failed";
	bytes: number | null;
	createdAt: string;
	expiresAt: string;
}

export const exportQuery = queryOptions({
	queryKey: ["export"],
	queryFn: () => api<ExportInfo | null>("/api/me/export"),
	// While building, check now and then in case the live update is missed.
	refetchInterval: (q) => (q.state.data?.status === "building" ? 4_000 : false),
});

const size = (bytes: number) =>
	bytes < 1_000_000
		? `${Math.max(1, Math.round(bytes / 1000))} KB`
		: `${(bytes / 1_000_000).toFixed(1)} MB`;

function DeleteAccount({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		setPending(true);
		setError(null);
		try {
			await api("/api/me", {
				method: "DELETE",
				body: JSON.stringify({ password, confirm }),
			});
			queryClient.clear();
			await navigate({
				to: "/signin",
				search: { notice: t("Your account and everything in it is deleted.") },
			});
		} catch (err) {
			setPending(false);
			setError(
				err instanceof ApiError
					? (Object.values(err.fields)[0] ?? err.message)
					: t("Couldn't delete. Try again."),
			);
		}
	}

	return (
		<Sheet open={open} onClose={onClose} title={t("Delete your account?")}>
			<form onSubmit={onSubmit} className="space-y-4" noValidate>
				<p className="text-ink-soft">
					{t(
						"This permanently deletes your expenses, receipts and photos, goals, family links and settings. People in your family circle stop seeing anything you shared. It can't be undone, so download your data first if you want a copy.",
					)}
				</p>
				<Field
					label={t("Your password")}
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<Field
					label={t("Type DELETE to confirm")}
					autoComplete="off"
					value={confirm}
					onChange={(e) => setConfirm(e.target.value)}
				/>
				<MaybeAlert tone="error" message={error} />
				<button
					type="submit"
					disabled={pending || confirm !== "DELETE" || !password}
					className="h-14 w-full rounded-full bg-coral font-semibold text-white transition-opacity disabled:opacity-40"
				>
					{pending ? t("Deleting…") : t("Delete my account forever")}
				</button>
			</form>
		</Sheet>
	);
}

/** Download everything, or delete everything. Your data, your call. */
export function YourData() {
	const queryClient = useQueryClient();
	const { data: latest } = useQuery(exportQuery);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ready =
		latest?.status === "ready" && new Date(latest.expiresAt) > new Date();

	async function start() {
		setError(null);
		try {
			const next = await api<ExportInfo>("/api/me/export", { method: "POST" });
			queryClient.setQueryData(exportQuery.queryKey, next);
		} catch (err) {
			setError(
				err instanceof ApiError
					? err.message
					: t("Couldn't start the export. Try again."),
			);
		}
	}

	return (
		<section
			aria-labelledby="data-heading"
			className="rounded-panel border border-line bg-surface p-5 sm:p-6"
		>
			<h2
				id="data-heading"
				className="flex items-center gap-2 text-[1.4rem] font-bold"
			>
				<ShieldCheck className="size-6 text-safe" aria-hidden="true" />{" "}
				{t("Your data")}
			</h2>
			<p className="mt-1 text-ink-soft">
				{t("It's yours. Take a full copy any time, or delete everything.")}
			</p>

			<div className="mt-4 flex flex-wrap items-center gap-3 rounded-tile bg-bg p-4">
				<FileArchive
					className="size-8 shrink-0 text-plum-500"
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<p className="font-semibold">{t("Download everything")}</p>
					<p className="text-[0.9rem] text-ink-soft">
						{latest?.status === "building"
							? t("Packing your data… we'll email you too.")
							: ready
								? t("Ready, {size}. Available until {date}.", {
										size: size(latest.bytes ?? 0),
										date: formatMoment(latest.expiresAt, {
											weekday: "short",
											hour: "numeric",
											minute: "2-digit",
										}),
									})
								: t(
										"Expenses as a spreadsheet, receipt photos, goals, family and settings, in one zip.",
									)}
					</p>
				</div>
				{latest?.status === "building" ? (
					<LoaderCircle
						className="size-6 animate-spin text-plum-500"
						aria-label={t("Packing your data")}
					/>
				) : ready ? (
					<a
						href={`/api/me/exports/${latest.id}/download`}
						className={buttonClass("coin", "md")}
					>
						<Download className="size-5" aria-hidden="true" /> {t("Download")}
					</a>
				) : (
					<button
						type="button"
						onClick={() => void start()}
						className={buttonClass("ink", "md")}
					>
						{t("Prepare download")}
					</button>
				)}
			</div>
			<MaybeAlert
				tone="error"
				message={
					error ??
					(latest?.status === "failed"
						? t("The last export didn't finish. Try again.")
						: null)
				}
			/>

			<button
				type="button"
				onClick={() => setDeleting(true)}
				className="mt-4 inline-flex items-center gap-2 font-semibold text-over underline-offset-4 hover:underline"
			>
				<Trash2 className="size-5" aria-hidden="true" />{" "}
				{t("Delete my account")}
			</button>
			<DeleteAccount open={deleting} onClose={() => setDeleting(false)} />
		</section>
	);
}
