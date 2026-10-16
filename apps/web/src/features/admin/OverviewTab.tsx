import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Mail, Power, UserPlus, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import {
	adminApi,
	FEATURE_NAMES,
	formatTokens,
	overviewQuery,
} from "@/lib/admin-api";
import { cn } from "@/lib/cn";
import { ChartView } from "../ask/charts/ChartView";

function Tile({
	icon,
	label,
	value,
	hint,
}: {
	icon: ReactNode;
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div className="rounded-panel border border-line bg-surface p-4">
			<div className="flex items-center gap-2 text-ink-soft">
				{icon}
				<span className="text-[0.9rem]">{label}</span>
			</div>
			<p className="num mt-2 text-[2rem] leading-none font-extrabold">
				{value}
			</p>
			{hint && <p className="mt-1 text-[0.82rem] text-ink-soft">{hint}</p>}
		</div>
	);
}

function AiSwitch({
	on,
	onChange,
}: {
	on: boolean;
	onChange: (on: boolean) => void;
}) {
	return (
		<label className="flex items-center justify-between gap-4 rounded-tile bg-bg px-4 py-3">
			<span>
				<span className="block font-semibold">AI for everyone</span>
				<span className="block text-[0.85rem] text-ink-soft">
					{on
						? "Voice, receipts and Ask are on."
						: "Paused: people can still type expenses."}
				</span>
			</span>
			<input
				type="checkbox"
				role="switch"
				aria-checked={on}
				checked={on}
				onChange={(e) => onChange(e.target.checked)}
				className="peer sr-only"
			/>
			<span
				aria-hidden="true"
				className="relative h-8 w-14 shrink-0 rounded-full bg-coral transition-colors peer-checked:bg-jade peer-focus-visible:outline-3 peer-focus-visible:outline-marigold after:absolute after:top-1 after:left-1 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-6"
			/>
		</label>
	);
}

/** The AI cockpit: who's using Spendid, how much AI it costs, whether email is healthy. */
export function OverviewTab() {
	const queryClient = useQueryClient();
	const { data } = useQuery(overviewQuery);
	const [allowance, setAllowance] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	if (!data)
		return <div className="h-64 animate-pulse rounded-panel bg-surface-2" />;

	const sent = data.email
		.filter((e) => e.status === "sent")
		.reduce((s, e) => s + e.count, 0);
	const failed = data.email
		.filter((e) => e.status === "failed")
		.reduce((s, e) => s + e.count, 0);
	const queued = data.email
		.filter((e) => e.status === "queued")
		.reduce((s, e) => s + e.count, 0);
	const save = async (patch: Parameters<typeof adminApi.settings>[0]) => {
		setError(null);
		try {
			await adminApi.settings(patch);
			await queryClient.invalidateQueries({ queryKey: ["admin"] });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't save.");
		}
	};

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Tile
					icon={<Users className="size-4" aria-hidden="true" />}
					label="People"
					value={String(data.people.total)}
				/>
				<Tile
					icon={<Power className="size-4" aria-hidden="true" />}
					label="Active this week"
					value={String(data.people.activeThisWeek)}
				/>
				<Tile
					icon={<UserPlus className="size-4" aria-hidden="true" />}
					label="New this week"
					value={String(data.people.newThisWeek)}
				/>
				<Tile
					icon={<Users className="size-4" aria-hidden="true" />}
					label="Paused"
					value={String(data.people.banned)}
				/>
			</div>

			<section
				aria-labelledby="ai-heading"
				className="space-y-4 rounded-panel border border-line bg-surface p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2
						id="ai-heading"
						className="flex items-center gap-2 text-[1.4rem] font-bold"
					>
						<Bot className="size-6 text-plum-500" aria-hidden="true" /> AI
						cockpit
					</h2>
					<p className="text-[0.9rem] text-ink-soft">
						Counts only. Nobody's words or money are stored here.
					</p>
				</div>
				<div className="grid gap-3 sm:grid-cols-3">
					<Tile
						icon={<Bot className="size-4" aria-hidden="true" />}
						label="Tokens today"
						value={formatTokens(data.ai.tokensToday)}
						hint={`${data.ai.callsToday} calls`}
					/>
					<Tile
						icon={<Bot className="size-4" aria-hidden="true" />}
						label="Tokens this month"
						value={formatTokens(data.ai.tokensMonth)}
					/>
					<Tile
						icon={<Bot className="size-4" aria-hidden="true" />}
						label="Default allowance"
						value={formatTokens(data.settings.defaultMonthlyTokens)}
						hint="per person per month"
					/>
				</div>
				{data.ai.daily.length > 1 && (
					<ChartView
						chart={{
							kind: "line",
							title: "Tokens per day, last 30 days",
							currency: "XXX",
							points: data.ai.daily.map((d) => ({
								label: d.day.slice(5),
								value: d.tokens,
							})),
						}}
						format={formatTokens}
					/>
				)}
				{data.ai.byFeature.length > 0 && (
					<ChartView
						chart={{
							kind: "bar",
							title: "This month by feature",
							currency: "XXX",
							points: data.ai.byFeature.map((f) => ({
								label: FEATURE_NAMES[f.feature] ?? f.feature,
								value: f.tokens,
							})),
						}}
						format={formatTokens}
					/>
				)}
				<MaybeAlert tone="error" message={error} />
				<AiSwitch
					on={data.settings.aiEnabled}
					onChange={(on) => void save({ aiEnabled: on })}
				/>
				<form
					className="flex flex-wrap items-end gap-2 rounded-tile bg-bg px-4 py-3"
					onSubmit={(e) => {
						e.preventDefault();
						const n = Number(allowance);
						if (Number.isInteger(n) && n >= 0)
							void save({ defaultMonthlyTokens: n }).then(() =>
								setAllowance(null),
							);
					}}
				>
					<label className="min-w-0 flex-1">
						<span className="block font-semibold">
							Default monthly allowance
						</span>
						<input
							inputMode="numeric"
							value={allowance ?? String(data.settings.defaultMonthlyTokens)}
							onChange={(e) => setAllowance(e.target.value.replace(/\D/g, ""))}
							className="num mt-1 h-11 w-full rounded-full border-2 border-line bg-surface px-4 outline-none focus:border-plum-500"
						/>
					</label>
					<button
						type="submit"
						disabled={allowance === null}
						className={cn(
							"h-11 rounded-full bg-plum-900 px-5 font-semibold text-plum-50 disabled:opacity-40 dark:bg-plum-50 dark:text-plum-900",
						)}
					>
						Save
					</button>
				</form>
			</section>

			<section
				aria-labelledby="mail-heading"
				className="rounded-panel border border-line bg-surface p-5"
			>
				<h2
					id="mail-heading"
					className="flex items-center gap-2 text-[1.4rem] font-bold"
				>
					<Mail className="size-6 text-plum-500" aria-hidden="true" /> Email,
					last 30 days
				</h2>
				<div className="mt-3 flex flex-wrap gap-2 text-[0.95rem]">
					<span className="rounded-full bg-jade/12 px-3 py-1 font-semibold text-safe">
						{sent} sent
					</span>
					<span
						className={cn(
							"rounded-full px-3 py-1 font-semibold",
							failed ? "bg-coral/12 text-over" : "bg-surface-2 text-ink-soft",
						)}
					>
						{failed} failed
					</span>
					<span className="rounded-full bg-surface-2 px-3 py-1 font-semibold text-ink-soft">
						{queued} waiting
					</span>
				</div>
			</section>
		</div>
	);
}
