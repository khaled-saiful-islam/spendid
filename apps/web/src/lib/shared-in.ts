import { useEffect } from "react";
import { capture } from "@/features/capture/capture-store";

const SHARED = "spendid-shared";

/** Payment-app phrasing around the shop name ("Payment to X successful"), dropped. */
export function cleanPaymentText(text: string): string {
	return text
		.replace(
			/\b(you('ve| have)? paid|payment (made )?to|paid to|transfer(red)? to|pembayaran kepada|bayar kepada)\b/gi,
			" ",
		)
		.replace(
			/\b(was |is |has been )?(successful(ly)?|completed|berjaya)\b/gi,
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Picks up something shared into Spendid from another app (see public/sw.js): a receipt
 * screenshot or PDF opens the receipt reader; shared text opens Type it, already read.
 */
export function useSharedIntoSpendid(): void {
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const kind = params.get("shared");
		if (!kind) return;
		const clean = () => {
			const url = new URL(window.location.href);
			url.searchParams.delete("shared");
			url.searchParams.delete("t");
			window.history.replaceState(null, "", url.pathname + url.search);
		};
		if (kind === "text") {
			const text = cleanPaymentText(params.get("t")?.slice(0, 300) ?? "");
			if (text) capture.openTypeWith({ text });
			clean();
			return;
		}
		if (kind === "receipt" && "caches" in window) {
			void (async () => {
				try {
					const cache = await caches.open(SHARED);
					const hit = await cache.match("/shared-receipt");
					if (hit) {
						const name = decodeURIComponent(
							hit.headers.get("x-name") ?? "receipt",
						);
						const blob = await hit.blob();
						await cache.delete("/shared-receipt");
						capture.openScanWith(new File([blob], name, { type: blob.type }));
					}
				} catch {
					// Storage unavailable: the person can still pick the file in the reader.
					capture.openScan();
				} finally {
					clean();
				}
			})();
		}
	}, []);
}
