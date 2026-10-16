import { ReceiptEventSchema } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "@/components/ui/Toast";
import { capture, getCaptureState } from "../capture/capture-store";

/**
 * One server-sent-events stream per open app. Today: receipts finished reading.
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

			const state = getCaptureState();
			const lookingAtIt = state.view === "receipt" && state.receiptId === id;
			if (lookingAtIt) return;
			if (status === "ready")
				toast("Your receipt is ready to check.", {
					label: "Check",
					run: () => capture.openReceipt(id),
				});
			if (status === "failed")
				toast("We couldn't read a receipt. You can fill it in yourself.", {
					label: "Open",
					run: () => capture.openReceipt(id),
				});
		});
		return () => source.close();
	}, [queryClient]);
}
