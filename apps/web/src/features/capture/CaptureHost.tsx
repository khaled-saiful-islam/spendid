import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Keyboard, Mic, ScanLine } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { meQuery } from "@/lib/me";
import { capture, useCapture } from "./capture-store";
import { ExpenseForm } from "./ExpenseForm";

const MODES = [
	{
		id: "voice",
		icon: Mic,
		title: "Say it",
		hint: "Talk naturally, even several things at once",
		ready: "M3",
	},
	{
		id: "scan",
		icon: ScanLine,
		title: "Scan a receipt",
		hint: "Point your camera, it captures by itself",
		ready: "M4",
	},
	{
		id: "type",
		icon: Keyboard,
		title: "Type it",
		hint: "Shorthand like “coffee 6.50” is fine",
		ready: null,
	},
] as const;

/** Renders the add / edit sheets for the whole app. */
export function CaptureHost() {
	const state = useCapture();
	const { data: me } = useQuery(meQuery);
	const homeCurrency = me?.profile.homeCurrency ?? "MYR";

	return (
		<>
			<Sheet
				open={state.view === "menu"}
				onClose={capture.close}
				title="Add spending"
			>
				<ul className="space-y-2">
					{MODES.map(({ id, icon: Icon, title, hint, ready }) => {
						const content = (
							<>
								<span className="grid size-12 shrink-0 place-items-center rounded-full bg-marigold text-plum-900">
									<Icon className="size-6" aria-hidden="true" />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block font-semibold">{title}</span>
									<span className="block text-[0.9rem] text-ink-soft">
										{hint}
									</span>
								</span>
								{ready ? (
									<span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[0.78rem] font-medium text-ink-soft">
										Arrives in {ready}
									</span>
								) : (
									<ChevronRight
										className="size-5 shrink-0 text-ink-soft"
										aria-hidden="true"
									/>
								)}
							</>
						);
						const rowClass =
							"flex w-full items-center gap-4 rounded-tile bg-bg p-4 text-left";
						return (
							<li key={id}>
								{ready ? (
									<div className={cn(rowClass, "opacity-70")}>{content}</div>
								) : (
									<button
										type="button"
										data-autofocus
										onClick={capture.openType}
										className={cn(rowClass, "hover:bg-surface-2")}
									>
										{content}
									</button>
								)}
							</li>
						);
					})}
				</ul>
			</Sheet>

			<Sheet
				open={state.view === "type"}
				onClose={capture.close}
				title="Add an expense"
			>
				<ExpenseForm homeCurrency={homeCurrency} onDone={capture.close} />
			</Sheet>

			<Sheet
				open={state.view === "edit"}
				onClose={capture.close}
				title="Edit expense"
			>
				{state.view === "edit" && (
					<ExpenseForm
						key={state.transaction.id}
						homeCurrency={homeCurrency}
						editing={state.transaction}
						onDone={capture.close}
					/>
				)}
			</Sheet>
		</>
	);
}
