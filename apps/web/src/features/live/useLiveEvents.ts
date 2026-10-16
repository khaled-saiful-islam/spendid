import {
	FAMILY_EVENT,
	FamilyEventSchema,
	ReceiptEventSchema,
} from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { capture, getCaptureState } from "../capture/capture-store";
import { splitReceipts } from "../family/split/waiting";

/**
 * One server-sent-events stream per open app: receipts finished reading, and family
 * changes (someone joined, changed what they share, cheered, added to a jar).
 * EventSource reconnects by itself; queries also poll while waiting, so nothing is lost.
 */
export function useLiveEvents(): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		const source = new EventSource("/api/events");
		source.addEventListener("receipt", (e) => {
			const parsed = ReceiptEventSchema.safeParse(
				JSON.parse((e as MessageEvent<string>).data),
			);
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
		});
		source.addEventListener(FAMILY_EVENT, (e) => {
			const parsed = FamilyEventSchema.safeParse(
				JSON.parse((e as MessageEvent<string>).data),
			);
			if (!parsed.success) return;
			void queryClient.invalidateQueries({ queryKey: ["family"] });
			if (parsed.data.what === "jar")
				void queryClient.invalidateQueries({ queryKey: ["goals"] });
			if (parsed.data.message) toast(parsed.data.message);
		});
		source.addEventListener("export", () => {
			void queryClient.invalidateQueries({ queryKey: ["export"] });
			toast(t("Your data is ready to download in Settings."));
		});
		return () => source.close();
	}, [queryClient]);
}
