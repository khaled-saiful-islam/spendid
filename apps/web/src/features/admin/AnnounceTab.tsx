import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { toast } from "@/components/ui/Toast";
import { ApiError, api } from "@/lib/http";
import { formatMoment } from "@/lib/time";

interface Announcement {
	id: string;
	subject: string;
	recipients: number;
	createdAt: string;
}

const announcementsQuery = queryOptions({
	queryKey: ["admin", "announcements"],
	queryFn: () => api<Announcement[]>("/api/admin/announcements"),
});

/** Product news by email to everyone who kept "Spendid news" on. Never anyone's data. */
export function AnnounceTab() {
	const queryClient = useQueryClient();
	const { data = [] } = useQuery(announcementsQuery);
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		setPending(true);
		setError(null);
		try {
			const { recipients } = await api<{ recipients: number }>(
				"/api/admin/announcements",
				{
					method: "POST",
					body: JSON.stringify({ subject, body }),
				},
			);
			await queryClient.invalidateQueries({ queryKey: ["admin"] });
			toast(`Sent to ${recipients} ${recipients === 1 ? "person" : "people"}.`);
			setSubject("");
			setBody("");
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : "Couldn't send. Try again.",
			);
		}
		setPending(false);
	}

	return (
		<div className="space-y-6">
			<form
				onSubmit={onSubmit}
				className="space-y-4 rounded-panel border border-line bg-surface p-5"
			>
				<h2 className="flex items-center gap-2 text-[1.4rem] font-bold">
					<Megaphone className="size-6 text-plum-500" aria-hidden="true" /> Send
					news
				</h2>
				<p className="text-ink-soft">
					Goes to people who kept "Spendid news" on, after their quiet hours.
					Never put anyone's personal details here.
				</p>
				<Field
					label="Subject"
					value={subject}
					maxLength={120}
					onChange={(e) => setSubject(e.target.value)}
				/>
				<label className="block space-y-1.5">
					<span className="block font-semibold">Message</span>
					<textarea
						value={body}
						maxLength={2000}
						rows={6}
						onChange={(e) => setBody(e.target.value)}
						className="w-full rounded-tile border-2 border-line bg-surface px-4 py-3 outline-none focus:border-plum-500"
					/>
				</label>
				<MaybeAlert tone="error" message={error} />
				<SubmitButton pending={pending} pendingLabel="Sending…">
					Send to everyone
				</SubmitButton>
			</form>
			<section aria-labelledby="sent-heading" className="space-y-2">
				<h2 id="sent-heading" className="text-[1.2rem] font-bold">
					Sent before
				</h2>
				{data.length === 0 ? (
					<p className="text-ink-soft">Nothing sent yet.</p>
				) : (
					<ul className="divide-y divide-line rounded-panel border border-line bg-surface">
						{data.map((a) => (
							<li
								key={a.id}
								className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
							>
								<span className="font-semibold break-words">{a.subject}</span>
								<span className="text-[0.88rem] text-ink-soft">
									{a.recipients} {a.recipients === 1 ? "person" : "people"},{" "}
									{formatMoment(a.createdAt, {
										day: "numeric",
										month: "short",
									})}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
