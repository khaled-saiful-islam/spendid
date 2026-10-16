import type { Category } from "@spendid/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue } from "react";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { api } from "@/lib/http";

export interface KnownShop {
	name: string;
	categoryId: string | null;
}

const shopsQuery = (q: string) =>
	queryOptions({
		queryKey: ["merchants", q.toLowerCase()],
		queryFn: () =>
			api<KnownShop[]>(`/api/merchants?q=${encodeURIComponent(q)}`),
		staleTime: 60_000,
		enabled: q.length >= 2,
	});

/**
 * Shops you've used before that match what you're typing, each with the category you
 * usually pick. Tapping one fills both (smart categories).
 */
export function ShopSuggestions({
	typed,
	categories,
	onPick,
}: {
	typed: string;
	categories: Category[];
	onPick: (shop: KnownShop) => void;
}) {
	const q = useDeferredValue(typed.trim());
	const { data = [] } = useQuery(shopsQuery(q));
	const shown = data
		.filter((s) => s.name.toLowerCase() !== q.toLowerCase())
		.slice(0, 4);
	return (
		<AnimatePresence>
			{q.length >= 2 && shown.length > 0 && (
				<motion.div
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					exit={{ opacity: 0, height: 0 }}
					className="-mt-2 overflow-hidden"
				>
					<p className="mb-1.5 flex items-center gap-1.5 text-[0.85rem] font-semibold text-ink-soft">
						<Sparkles
							className="size-3.5 text-marigold-deep"
							aria-hidden="true"
						/>{" "}
						{t("Shops you've used")}
					</p>
					<div className="flex flex-wrap gap-2">
						{shown.map((s) => {
							const cat = categories.find((c) => c.id === s.categoryId);
							return (
								<button
									key={s.name}
									type="button"
									onClick={() => onPick(s)}
									className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-line bg-surface py-1 pr-3 pl-1 text-left text-[0.92rem] font-semibold hover:border-plum-300"
								>
									<CategoryIcon
										icon={cat?.icon}
										tint={cat?.tint}
										size="sm"
										className="size-7 [&_svg]:size-3.5"
									/>
									<span>
										{s.name}
										{cat && (
											<span className="font-normal text-ink-soft">
												, {cat.name}
											</span>
										)}
									</span>
								</button>
							);
						})}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
