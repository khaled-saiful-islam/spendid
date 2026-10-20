import type { Receipt, SplitDto } from "@spendid/shared";
import { parseAmount } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { t } from "@/i18n";
import {
	familyApi,
	familyQuery,
	type ReceiptChoice,
	refreshFamily,
} from "@/lib/family-api";
import { ApiError } from "@/lib/http";
import { meQuery } from "@/lib/me";
import { receiptQuery } from "@/lib/receipts-api";
import { ScanCamera } from "../../scan/ScanCamera";
import { SourcePicker } from "./SourcePicker";
import { SplitBuilder, type SplitDraft } from "./SplitBuilder";
import { SplitDone } from "./SplitDone";
import { splitReceipts } from "./waiting";

type Stage =
	| { kind: "source" }
	| { kind: "camera" }
	| { kind: "reading"; receiptId: string }
	| { kind: "build" }
	| { kind: "done"; split: SplitDto };

const key = () => Math.random().toString(36).slice(2, 10);

function fromReceipt(
	base: SplitDraft,
	r: {
		merchant: string;
		currency: string;
		totalMinor: number;
		items: { name: string; totalMinor: number }[];
	},
): SplitDraft {
	const items = r.items.map((i) => ({
		key: key(),
		name: i.name,
		amountMinor: i.totalMinor,
		people: [],
	}));
	const extra = r.totalMinor - items.reduce((a, i) => a + i.amountMinor, 0);
	const digits =
		new Intl.NumberFormat("en", {
			style: "currency",
			currency: r.currency,
		}).resolvedOptions().maximumFractionDigits ?? 2;
	return {
		...base,
		title: r.merchant,
		currency: r.currency,
		items,
		adjust: extra ? (extra / 10 ** digits).toFixed(digits) : "",
	};
}

function Reading({
	receiptId,
	onRead,
	onFailed,
}: {
	receiptId: string;
	onRead: (r: Receipt) => void;
	onFailed: () => void;
}) {
	const { data } = useQuery(receiptQuery(receiptId));
	useEffect(() => {
		if (data?.status === "ready" && data.draft) onRead(data);
		if (data?.status === "failed") onFailed();
	}, [data, onRead, onFailed]);
	return (
		<div className="grid place-items-center gap-4 rounded-panel border border-line bg-surface p-10 text-center">
			<motion.span
				animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.15, 1] }}
				transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.6 }}
				className="grid size-16 place-items-center rounded-full bg-linear-to-br from-plum-500 to-coral text-white dark:text-plum-950"
			>
				<Sparkles className="size-8" aria-hidden="true" />
			</motion.span>
			<p className="text-[1.2rem] font-bold">{t("Reading every line…")}</p>
			<p className="text-ink-soft">{t("This usually takes a few seconds.")}</p>
		</div>
	);
}

/** Photo bill splitter: pick or snap a bill, give lines to people, send a link. */
export function SplitPage() {
	const queryClient = useQueryClient();
	const { data: me } = useQuery(meQuery);
	const { data: family } = useQuery(familyQuery);
	const [stage, setStage] = useState<Stage>({ kind: "source" });
	const [notice, setNotice] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const base: SplitDraft = {
		title: "",
		currency: me?.profile.homeCurrency ?? "MYR",
		people: me
			? [{ key: "me", name: me.user.name.slice(0, 40), userId: me.user.id }]
			: [],
		items: [],
		adjust: "",
	};
	const [draft, setDraft] = useState<SplitDraft>(base);

	const startWith = (next: SplitDraft) => {
		setDraft(next);
		setStage({ kind: "build" });
	};

	async function create() {
		setPending(true);
		setError(null);
		const adjust = parseAmount(draft.adjust) || 0;
		const digits =
			new Intl.NumberFormat("en", {
				style: "currency",
				currency: draft.currency,
			}).resolvedOptions().maximumFractionDigits ?? 2;
		try {
			const split = await familyApi.createSplit({
				title: draft.title.trim() || t("Shared bill"),
				currency: draft.currency,
				people: draft.people,
				items: draft.items,
				adjustMinor: Math.round(adjust * 10 ** digits),
			});
			await refreshFamily(queryClient);
			setStage({ kind: "done", split });
		} catch (err) {
			setError(
				err instanceof ApiError
					? err.message
					: t("Couldn't make the split. Try again."),
			);
		}
		setPending(false);
	}

	return (
		<div className="space-y-6">
			<Link
				to="/app/family"
				className="inline-flex items-center gap-2 font-semibold text-ink-soft hover:text-ink"
			>
				<ArrowLeft className="size-5" aria-hidden="true" /> {t("Family")}
			</Link>
			<PageHeader
				title={stage.kind === "done" ? stage.split.title : t("Split a bill")}
			/>
			<MaybeAlert tone="info" message={notice} />
			{stage.kind === "source" && (
				<SourcePicker
					onSnap={() => setStage({ kind: "camera" })}
					onPick={(r: ReceiptChoice) => startWith(fromReceipt(base, r))}
					onManual={() => startWith(base)}
				/>
			)}
			{stage.kind === "camera" && (
				<ScanCamera
					onClose={() => setStage({ kind: "source" })}
					onUploaded={(receiptId) => {
						splitReceipts.add(receiptId);
						setStage({ kind: "reading", receiptId });
					}}
				/>
			)}
			{stage.kind === "reading" && (
				<Reading
					receiptId={stage.receiptId}
					onRead={(r) => r.draft && startWith(fromReceipt(base, r.draft))}
					onFailed={() => {
						setNotice(
							t("We couldn't read that bill. Add the lines yourself below."),
						);
						startWith(base);
					}}
				/>
			)}
			{stage.kind === "build" && (
				<SplitBuilder
					draft={draft}
					onChange={setDraft}
					circle={family?.people ?? []}
					pending={pending}
					error={error}
					onSubmit={() => void create()}
				/>
			)}
			{stage.kind === "done" && <SplitDone split={stage.split} />}
		</div>
	);
}
