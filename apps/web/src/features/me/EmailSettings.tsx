import {
	EMAIL_GROUP_INFO,
	EMAIL_GROUPS,
	type NotificationPrefs,
} from "@spendid/shared";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Mail, Moon } from "lucide-react";
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { toast } from "@/components/ui/Toast";
import { dateLocale, t } from "@/i18n";
import { api } from "@/lib/http";

export const notificationsQuery = queryOptions({
	queryKey: ["notifications"],
	queryFn: () => api<NotificationPrefs>("/api/me/notifications"),
});

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) =>
	new Date(2026, 0, 1, h).toLocaleTimeString(dateLocale(), { hour: "numeric" });

function Toggle({
	label,
	about,
	checked,
	onChange,
	icon,
}: {
	label: string;
	about: string;
	checked: boolean;
	onChange: (on: boolean) => void;
	icon?: ReactNode;
}) {
	return (
		<label className="flex cursor-pointer items-center justify-between gap-4 py-3">
			<span className="min-w-0">
				<span className="flex items-center gap-2 font-semibold">
					{icon}
					{label}
				</span>
				<span className="block text-[0.9rem] text-ink-soft">{about}</span>
			</span>
			<input
				type="checkbox"
				role="switch"
				aria-checked={checked}
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="peer sr-only"
			/>
			<span
				aria-hidden="true"
				className="relative h-8 w-14 shrink-0 rounded-full bg-surface-2 ring-1 ring-line transition-colors peer-checked:bg-jade peer-focus-visible:outline-3 peer-focus-visible:outline-marigold after:absolute after:top-1 after:left-1 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-6"
			/>
		</label>
	);
}

/** Which emails to get, hidden amounts and quiet hours. Account and security emails always go out. */
export function EmailSettings() {
	const queryClient = useQueryClient();
	const { data } = useQuery(notificationsQuery);
	if (!data)
		return <div className="h-64 animate-pulse rounded-panel bg-surface-2" />;

	async function save(patch: Partial<NotificationPrefs>) {
		const previous = data;
		queryClient.setQueryData(notificationsQuery.queryKey, {
			...data,
			...patch,
		} as NotificationPrefs);
		try {
			await api<NotificationPrefs>("/api/me/notifications", {
				method: "PUT",
				body: JSON.stringify(patch),
			});
		} catch {
			queryClient.setQueryData(notificationsQuery.queryKey, previous);
			toast(t("Couldn't save. Try again."));
		}
	}

	return (
		<section
			aria-labelledby="email-heading"
			className="rounded-panel border border-line bg-surface p-5 sm:p-6"
		>
			<SectionHeader
				id="email-heading"
				title={t("Emails")}
				icon={Mail}
				tint="rose"
				sub={t(
					"Sign-in, security and account emails always come. Choose the rest.",
				)}
			/>
			<div className="mt-3 divide-y divide-line">
				{EMAIL_GROUPS.map((g) => (
					<Toggle
						key={g}
						label={t(EMAIL_GROUP_INFO[g].label)}
						about={t(EMAIL_GROUP_INFO[g].about)}
						checked={data[g]}
						onChange={(on) => void save({ [g]: on })}
					/>
				))}
			</div>
			<div className="mt-4 space-y-1 rounded-tile bg-bg px-4">
				<Toggle
					icon={<EyeOff className="size-4 text-plum-500" aria-hidden="true" />}
					label={t("Hide amounts in emails")}
					about={t(
						"Shows RM ••• instead of numbers, for shared inboxes and lock screens.",
					)}
					checked={data.hideAmounts}
					onChange={(on) => void save({ hideAmounts: on })}
				/>
			</div>
			<fieldset className="mt-4 rounded-tile bg-bg px-4 py-3">
				<legend className="sr-only">{t("Quiet hours")}</legend>
				<p className="flex items-center gap-2 font-semibold">
					<Moon className="size-4 text-plum-500" aria-hidden="true" />{" "}
					{t("Quiet hours")}
				</p>
				<p className="text-[0.9rem] text-ink-soft">
					{t(
						"Emails that would arrive now wait until quiet hours end. Security emails never wait.",
					)}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<label className="flex items-center gap-2">
						<span>{t("From")}</span>
						<select
							value={data.quietStart}
							onChange={(e) =>
								void save({ quietStart: Number(e.target.value) })
							}
							className="h-11 rounded-full border-2 border-line bg-surface px-3 outline-none focus:border-plum-500"
						>
							{HOURS.map((h) => (
								<option key={h} value={h}>
									{hourLabel(h)}
								</option>
							))}
						</select>
					</label>
					<label className="flex items-center gap-2">
						<span>{t("to")}</span>
						<select
							value={data.quietEnd}
							onChange={(e) => void save({ quietEnd: Number(e.target.value) })}
							className="h-11 rounded-full border-2 border-line bg-surface px-3 outline-none focus:border-plum-500"
						>
							{HOURS.map((h) => (
								<option key={h} value={h}>
									{hourLabel(h)}
								</option>
							))}
						</select>
					</label>
					{data.quietStart === data.quietEnd && (
						<span className="text-[0.9rem] text-ink-soft">
							{t("No quiet hours.")}
						</span>
					)}
				</div>
			</fieldset>
		</section>
	);
}
