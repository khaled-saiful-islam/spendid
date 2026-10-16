import type {
	ApiResponse,
	Receipt,
	ReceiptSave,
	Transaction,
} from "@spendid/shared";
import { queryOptions } from "@tanstack/react-query";
import { ApiError, api } from "./http";

export interface Warranty {
	id: string;
	itemName: string;
	purchasedOn: string;
	endsOn: string;
	months: number;
	transactionId: string;
}

export const pendingReceiptsQuery = queryOptions({
	queryKey: ["receipts"],
	queryFn: () => api<Receipt[]>("/api/receipts"),
	staleTime: 10_000,
});

/** One receipt; polls gently while it's being read in case a live update is missed. */
export const receiptQuery = (id: string) =>
	queryOptions({
		queryKey: ["receipt", id],
		queryFn: () => api<Receipt>(`/api/receipts/${id}`),
		refetchInterval: (q) =>
			q.state.data?.status === "reading" ? 3_000 : false,
	});

export const warrantiesQuery = queryOptions({
	queryKey: ["warranties"],
	queryFn: () => api<Warranty[]>("/api/warranties"),
});

export const receiptImageUrl = (id: string) => `/api/receipts/${id}/image`;

export const receiptsApi = {
	/** Sends the flattened photo; reading happens in the background. */
	async upload(photo: Blob): Promise<Receipt> {
		let res: Response;
		try {
			res = await fetch("/api/capture/receipt", {
				method: "POST",
				headers: { "Content-Type": photo.type || "image/jpeg" },
				body: photo,
			});
		} catch {
			throw new ApiError(
				"Couldn't reach Spendid. Check your connection and try again.",
				0,
			);
		}
		const body = (await res
			.json()
			.catch(() => null)) as ApiResponse<Receipt> | null;
		if (!body)
			throw new ApiError(
				"Spendid sent an unexpected reply. Try again.",
				res.status,
			);
		if (!body.success) throw new ApiError(body.error, res.status, body.fields);
		return body.data;
	},
	save: (id: string, input: ReceiptSave) =>
		api<Transaction>(`/api/receipts/${id}/save`, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	discard: (id: string) =>
		api<null>(`/api/receipts/${id}`, { method: "DELETE" }),
};
