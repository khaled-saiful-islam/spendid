import {
	FAMILY_EVENT,
	FamilyEventSchema,
	ReceiptEventSchema,
} from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { noticesQuery } from "@/lib/notices-api";
import { parseEventData, reconnectDelay } from "@/lib/sse";
import { capture, getCaptureState } from "../capture/capture-store";
import { splitReceipts } from "../family/split/waiting";

/**
 * One server-sent-events stream per open app: receipts finished reading, and family
 * changes (someone joined, changed what they share, cheered, added to a jar).
 * EventSource reconnects by itself after a dropped line; when it gives up (the server was
 * down or answered with an error), this reconnects with a growing wait. Queries also poll
 * while waiting, so nothing is lost.
 */
export function useLiveEvents(): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		let source: EventSource | null = null;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let failures = 0;
		const data = (e: Event) => parseEventData((e as MessageEvent<string>).data);

		const onReceipt = (e: Event) => {
			const parsed = ReceiptEventSchema.safeParse(data(e));
			if (!parsed.success) return;
			const { id, status } = parsed.data;
			void queryClient.invalidateQueries({ queryKey: ["receipts"] });
			void queryClient.invalidateQueries({ queryKey: ["receipt", id] });

			if (splitReceipts.has(id)) return;
			const state = getCaptureState();
			const lookingAtIt = state.view === "receipt" && state.receiptId === id;
			if (lookingAtIt) return;
			if (status === "ready")
				toast(t("Your receipt is ready to check."), {
					label: "Check",
					run: () => capture.openReceipt(id),
				});
			if (status === "failed")
				toast(t("We couldn't read a receipt. You can fill it in yourself."), {
					label: "Open",
					run: () => capture.openReceipt(id),
				});
		};
		const onFamily = (e: Event) => {
			const parsed = FamilyEventSchema.safeParse(data(e));
			if (!parsed.success) return;
			void queryClient.invalidateQueries({ queryKey: ["family"] });
			if (parsed.data.what === "jar")
				void queryClient.invalidateQueries({ queryKey: ["goals"] });
			if (parsed.data.message) toast(parsed.data.message);
		};
		// A new alert: refresh the bell and say so briefly.
		const onNotices = async () => {
			await queryClient.invalidateQueries({ queryKey: noticesQuery.queryKey });
			const latest = queryClient.getQueryData(noticesQuery.queryKey)?.items[0];
			if (latest && !latest.read) toast(latest.title);
		};
		const onExport = () => {
			void queryClient.invalidateQueries({ queryKey: ["export"] });
			toast(t("Your data is ready to download in Settings."));
		};

		const connect = () => {
			source = new EventSource("/api/events");
			source.addEventListener("open", () => {
				failures = 0;
			});
			source.addEventListener("error", () => {
				// CLOSED means the browser won't retry on its own.
				if (source?.readyState !== EventSource.CLOSED) return;
				source.close();
				retry = setTimeout(connect, reconnectDelay(failures));
				failures += 1;
			});
			source.addEventListener("receipt", onReceipt);
			source.addEventListener(FAMILY_EVENT, onFamily);
			source.addEventListener("export", onExport);
			source.addEventListener("notices", () => void onNotices());
		};
		connect();
		return () => {
			clearTimeout(retry);
			source?.close();
		};
	}, [queryClient]);
}
