import { formatMinor, type SplitDto } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, ReceiptText, Trash2 } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import {
	familyApi,
	refreshFamily,
	splitsQuery,
	splitsWithMeQuery,
} from "@/lib/family-api";
import { meQuery } from "@/lib/me";
import { formatMoment } from "@/lib/time";
import { SplitDone } from "./SplitDone";
import { SplitSummary } from "./SplitSummary";

const dayOf = (iso: string) =>
	formatMoment(iso, {
		day: "numeric",
		month: "short",
	});

function Row({
	split,
	line,
	onOpen,
	paid,
}: {
	split: SplitDto;
	line: string;
	onOpen: () => void;
	/** For bills I split: how many of the people have paid. */
	paid?: { done: number; of: number };
}) {
	return (
		<li>
			<button
				type="button"
				onClick={onOpen}
				className="flex w-full items-center gap-3 rounded-tile px-2 py-2.5 text-left hover:bg-surface-2"
			>
				<span className="grid size-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-marigold to-coral text-plum-900">
					<ReceiptText className="size-5" aria-hidden="true" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block font-semibold break-words">{split.title}</span>
					<span className="block text-[0.85rem] text-ink-soft">{line}</span>
					{paid && paid.of > 0 && (
						<span className="mt-1.5 flex gap-1" aria-hidden="true">
							{Array.from({ length: paid.of }, (_, i) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: one fixed slot per person
									key={i}
									className={cn(
										"h-1.5 flex-1 rounded-full",
										i < paid.done ? "bg-jade" : "bg-ink/10",
									)}
								/>
							))}
						</span>
					)}
				</span>
				<span className="num shrink-0 font-bold">
					{formatMinor(split.result.totalMinor, split.currency)}
				</span>
			</button>
		</li>
	);
}

/** Bills I split, and bills people in my circle split with me. */
export function SplitsSection() {
	const queryClient = useQueryClient();
	const { data: me } = useQuery(meQuery);
	const { data: mine = [] } = useQuery(splitsQuery);
	const { data: withMe = [] } = useQuery(splitsWithMeQuery);
	const [open, setOpen] = useState<SplitDto | null>(null);
	const isMine = open ? mine.some((s) => s.id === open.id) : false;
	const myShare = (s: SplitDto) => {
		const key = s.people.find((p) => p.userId === me?.user.id)?.key;
		return s.result.shares.find((x) => x.key === key);
	};

	return (
		<section aria-labelledby="splits-heading" className="space-y-3">
			<SectionHeader
				id="splits-heading"
				title={t("Split bills")}
				icon={ReceiptText}
				tint="cyan"
				action={
					<Link
						to="/app/family/split"
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						<Plus className="size-5" aria-hidden="true" /> {t("New split")}
					</Link>
				}
			/>
			{mine.length === 0 && withMe.length === 0 ? (
				<p className="rounded-panel border-2 border-dashed border-line p-5 text-ink-soft">
					{t(
						"Snap a bill, drag each line onto who had it, and send everyone a link with their share.",
					)}
				</p>
			) : (
				<ul className="rounded-panel border border-line bg-surface p-2">
					{withMe.map((s) => {
						const share = myShare(s);
						return (
							<Row
								key={s.id}
								split={s}
								onOpen={() => setOpen(s)}
								line={t(
									share && s.paid.includes(share.key)
										? "{name} split this with you, {date}. Your share: {amount}, paid"
										: "{name} split this with you, {date}. Your share: {amount}",
									{
										name: s.ownerName,
										date: dayOf(s.createdAt),
										amount: formatMinor(share?.totalMinor ?? 0, s.currency),
									},
								)}
							/>
						);
					})}
					{mine.map((s) => (
						<Row
							key={s.id}
							split={s}
							onOpen={() => setOpen(s)}
							line={t("{date}, {paid} of {n} paid", {
								date: dayOf(s.createdAt),
								paid: s.paid.length,
								n: s.people.length,
							})}
							paid={{ done: s.paid.length, of: s.people.length }}
						/>
					))}
				</ul>
			)}
			<Sheet
				open={open !== null}
				onClose={() => setOpen(null)}
				title={open?.title ?? t("Split")}
			>
				{open && (
					<div className="space-y-5">
						{isMine ? (
							<SplitDone split={open} showDone={false} />
						) : (
							<SplitSummary split={open} />
						)}
						{isMine && (
							<button
								type="button"
								className="inline-flex items-center gap-2 font-semibold text-over underline-offset-4 hover:underline"
								onClick={() =>
									void familyApi
										.removeSplit(open.id)
										.then(() => refreshFamily(queryClient))
										.then(() => {
											setOpen(null);
											toast(t("Split deleted. Its link no longer works."));
										})
										.catch(() => toast(t("Couldn't delete. Try again.")))
								}
							>
								<Trash2 className="size-5" aria-hidden="true" />{" "}
								{t("Delete this split")}
							</button>
						)}
					</div>
				)}
			</Sheet>
		</section>
	);
}
