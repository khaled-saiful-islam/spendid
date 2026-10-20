import {
	computeSplit,
	type FamilyPerson,
	formatMinor,
	parseAmount,
	type SplitItem,
	type SplitPerson,
	toMinor,
} from "@spendid/shared";
import { Plus, UserPlus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { currencySymbol } from "../../onboarding/options";
import { Avatar } from "../parts";
import { ItemRow, PERSON_ATTR } from "./ItemRow";

export interface SplitDraft {
	title: string;
	currency: string;
	people: SplitPerson[];
	items: SplitItem[];
	adjust: string;
}

const newKey = () => Math.random().toString(36).slice(2, 10);
const parseMajor = (v: string) => parseAmount(v);
/** Short chip label; the full name shows on each line's choices. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** People across the top (drop targets with live totals), bill lines below. */
export function SplitBuilder({
	draft,
	onChange,
	circle,
	pending,
	error,
	onSubmit,
}: {
	draft: SplitDraft;
	onChange: (next: SplitDraft) => void;
	circle: FamilyPerson[];
	pending: boolean;
	error: string | null;
	onSubmit: () => void;
}) {
	const [hover, setHover] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [guest, setGuest] = useState("");
	const [itemName, setItemName] = useState("");
	const [itemAmount, setItemAmount] = useState("");
	const cur = draft.currency;
	const adjustMinor = Number.isFinite(parseMajor(draft.adjust))
		? toMinor(parseMajor(draft.adjust) || 0, cur)
		: 0;
	const result = computeSplit({
		people: draft.people,
		items: draft.items,
		adjustMinor,
	});
	const shareOf = new Map(result.shares.map((s) => [s.key, s.totalMinor]));
	const notAdded = circle.filter(
		(p) => !draft.people.some((d) => d.userId === p.userId),
	);

	const set = (patch: Partial<SplitDraft>) => onChange({ ...draft, ...patch });
	const toggle = (itemKey: string, personKey: string) =>
		set({
			items: draft.items.map((it) =>
				it.key !== itemKey
					? it
					: {
							...it,
							people: it.people.includes(personKey)
								? it.people.filter((k) => k !== personKey)
								: [...it.people, personKey],
						},
			),
		});
	const addPerson = (p: SplitPerson) => set({ people: [...draft.people, p] });
	const removePerson = (key: string) =>
		set({
			people: draft.people.filter((p) => p.key !== key),
			items: draft.items.map((it) => ({
				...it,
				people: it.people.filter((k) => k !== key),
			})),
		});

	function addGuest(e: FormEvent) {
		e.preventDefault();
		const name = guest.trim();
		if (!name) return;
		addPerson({ key: newKey(), name: name.slice(0, 40), userId: null });
		setGuest("");
		setAdding(false);
	}

	function addItem(e: FormEvent) {
		e.preventDefault();
		const amount = parseMajor(itemAmount);
		if (!itemName.trim() || !(amount > 0)) return;
		set({
			items: [
				...draft.items,
				{
					key: newKey(),
					name: itemName.trim().slice(0, 120),
					amountMinor: toMinor(amount, cur),
					people: [],
				},
			],
		});
		setItemName("");
		setItemAmount("");
	}

	return (
		<div className="space-y-6">
			<Field
				label={t("What's the bill?")}
				value={draft.title}
				maxLength={80}
				placeholder={t("Dinner, groceries, trip…")}
				onChange={(e) => set({ title: e.target.value })}
			/>

			{/* One wrapper around people and lines, so the sticky people bar stays up while scrolling the lines. */}
			<div className="space-y-3">
				<h2 id="split-people" className="text-[1.3rem] font-bold">
					{t("Who's in")}
				</h2>
				{/* Sticky so people stay in reach while dragging lines from further down. */}
				<ul className="sticky top-2 z-20 -mx-2 flex flex-wrap gap-2 rounded-panel bg-bg/85 p-2 backdrop-blur-md select-none">
					{draft.people.map((p) => (
						<motion.li
							key={p.key}
							layout
							{...{ [PERSON_ATTR]: p.key }}
							animate={{ scale: hover === p.key ? 1.08 : 1 }}
							className={cn(
								"flex items-center gap-2 rounded-full border-2 bg-surface py-1.5 pr-2 pl-1.5 transition-colors",
								hover === p.key
									? "border-plum-500 bg-plum-500/12 shadow-lift"
									: "border-line",
							)}
						>
							<Avatar name={p.name} seed={p.userId ?? p.key} size="sm" />
							<span className="min-w-0">
								<span
									className="block text-[0.92rem] leading-tight font-semibold break-words"
									title={p.name}
								>
									{p.key === "me" ? t("You") : firstName(p.name)}
								</span>
								<span className="num block text-[0.85rem] leading-tight text-ink-soft">
									{formatMinor(shareOf.get(p.key) ?? 0, cur)}
								</span>
							</span>
							{p.key !== "me" && (
								<button
									type="button"
									onClick={() => removePerson(p.key)}
									aria-label={t("Remove {name}", { name: p.name })}
									className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-surface-2"
								>
									<X className="size-4" aria-hidden="true" />
								</button>
							)}
						</motion.li>
					))}
					<li>
						<button
							type="button"
							onClick={() => setAdding((a) => !a)}
							aria-expanded={adding}
							className="flex h-full min-h-12 items-center gap-2 rounded-full border-2 border-dashed border-plum-300 px-4 font-semibold text-plum-500 hover:bg-plum-500/8"
						>
							<UserPlus className="size-5" aria-hidden="true" /> {t("Add")}
						</button>
					</li>
				</ul>
				<AnimatePresence>
					{adding && (
						<motion.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							className="overflow-hidden"
						>
							<div className="space-y-3 rounded-panel border border-line bg-surface p-4">
								{notAdded.length > 0 && (
									<div className="flex flex-wrap gap-2">
										{notAdded.map((p) => (
											<button
												key={p.userId}
												type="button"
												onClick={() =>
													addPerson({
														key: newKey(),
														name: p.name.slice(0, 40),
														userId: p.userId,
													})
												}
												className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-line py-1 pr-3 pl-1 font-semibold hover:bg-surface-2"
											>
												<Avatar
													name={p.name}
													seed={p.userId}
													size="sm"
													className="size-7 text-[0.65rem]"
												/>{" "}
												{p.name}
											</button>
										))}
									</div>
								)}
								<form onSubmit={addGuest} className="flex items-end gap-2">
									<Field
										className="min-w-0 flex-1"
										label={t("Someone else")}
										value={guest}
										maxLength={40}
										placeholder={t("Their name")}
										onChange={(e) => setGuest(e.target.value)}
									/>
									<button
										type="submit"
										className="h-13 shrink-0 rounded-tile bg-plum-900 px-4 font-semibold text-plum-50 dark:bg-plum-50 dark:text-plum-900"
									>
										{t("Add")}
									</button>
								</form>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
				<div className="h-3" aria-hidden="true" />

				<section aria-labelledby="split-items" className="space-y-3">
					<div>
						<h2 id="split-items" className="text-[1.3rem] font-bold">
							{t("Who had what")}
						</h2>
						<p className="text-ink-soft">
							{t(
								"Drag a line onto someone, or tap it to choose. Shared lines split evenly.",
							)}
						</p>
					</div>
					<ul className="space-y-2">
						{draft.items.map((item) => (
							<ItemRow
								key={item.key}
								item={item}
								people={draft.people}
								currency={cur}
								onHover={setHover}
								onToggle={(personKey) => toggle(item.key, personKey)}
								onEveryone={() =>
									set({
										items: draft.items.map((it) =>
											it.key === item.key
												? { ...it, people: draft.people.map((p) => p.key) }
												: it,
										),
									})
								}
								onRemove={() =>
									set({
										items: draft.items.filter((it) => it.key !== item.key),
									})
								}
							/>
						))}
					</ul>
					<form
						onSubmit={addItem}
						className="grid grid-cols-[1fr_8rem_auto] items-end gap-2"
					>
						<Field
							label={t("Add a line")}
							value={itemName}
							maxLength={120}
							placeholder={t("Teh tarik")}
							onChange={(e) => setItemName(e.target.value)}
						/>
						<Field
							label={t("Price")}
							inputMode="decimal"
							adornment={currencySymbol(cur)}
							value={itemAmount}
							onChange={(e) =>
								setItemAmount(e.target.value.replace(/[^\d.,]/g, ""))
							}
						/>
						<button
							type="submit"
							aria-label={t("Add line")}
							className="grid size-13 place-items-center rounded-tile bg-marigold text-plum-900"
						>
							<Plus className="size-6" aria-hidden="true" />
						</button>
					</form>
					<Field
						label={t("Tax, service and tip")}
						inputMode="decimal"
						adornment={currencySymbol(cur)}
						value={draft.adjust}
						hint={t(
							"Shared in proportion to what each person had. Use a minus for a discount.",
						)}
						onChange={(e) =>
							set({ adjust: e.target.value.replace(/[^\d.,-]/g, "") })
						}
					/>
				</section>
			</div>

			<div className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-30 rounded-panel border border-line bg-surface/95 p-3 shadow-lift backdrop-blur md:bottom-4">
				<div className="space-y-2">
					{result.unassignedMinor > 0 && (
						<p className="text-center text-[0.92rem] font-semibold text-warn">
							{t("{amount} still needs someone.", {
								amount: formatMinor(result.unassignedMinor, cur),
							})}
						</p>
					)}
					<MaybeAlert tone="error" message={error} />
					<form
						onSubmit={(e) => {
							e.preventDefault();
							onSubmit();
						}}
					>
						<SubmitButton
							pending={pending}
							pendingLabel={t("Making the link…")}
						>
							{t("Create split link, total {amount}", {
								amount: formatMinor(result.totalMinor, cur),
							})}
						</SubmitButton>
					</form>
				</div>
			</div>
		</div>
	);
}
