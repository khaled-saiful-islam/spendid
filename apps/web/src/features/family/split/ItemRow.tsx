import { formatMinor, type SplitItem, type SplitPerson } from "@spendid/shared";
import { GripVertical, Trash2, UsersRound } from "lucide-react";
import { motion, useDragControls } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "../parts";

export const PERSON_ATTR = "data-split-person";

/** The person chip under a screen point, if any. */
export function personAt(clientX: number, clientY: number): string | null {
	for (const el of document.elementsFromPoint(clientX, clientY)) {
		const key = (el as HTMLElement)
			.closest?.(`[${PERSON_ATTR}]`)
			?.getAttribute(PERSON_ATTR);
		if (key) return key;
	}
	return null;
}

/**
 * One bill line. Drag the handle onto a person to give it to them (drop again to take it
 * back), or tap the line to pick people. Shared lines split evenly.
 */
export function ItemRow({
	item,
	people,
	currency,
	onToggle,
	onEveryone,
	onRemove,
	onHover,
}: {
	item: SplitItem;
	people: SplitPerson[];
	currency: string;
	onToggle: (personKey: string) => void;
	onEveryone: () => void;
	onRemove: () => void;
	onHover: (personKey: string | null) => void;
}) {
	const controls = useDragControls();
	const [open, setOpen] = useState(false);
	const [dragging, setDragging] = useState(false);
	const owners = people.filter((p) => item.people.includes(p.key));
	const toClient = (point: { x: number; y: number }) =>
		[point.x - window.scrollX, point.y - window.scrollY] as const;

	return (
		<motion.li
			layout
			drag
			dragControls={controls}
			dragListener={false}
			dragSnapToOrigin
			dragMomentum={false}
			whileDrag={{ scale: 1.04, rotate: -1.5, zIndex: 30 }}
			onDragStart={() => setDragging(true)}
			onDrag={(_, info) => onHover(personAt(...toClient(info.point)))}
			onDragEnd={(_, info) => {
				setDragging(false);
				onHover(null);
				const key = personAt(...toClient(info.point));
				if (key) onToggle(key);
			}}
			className={cn(
				"relative rounded-tile border-2 bg-surface select-none",
				owners.length === 0 ? "border-dashed border-marigold" : "border-line",
				dragging && "shadow-lift",
			)}
		>
			<div className="flex items-center gap-1 pr-2">
				<button
					type="button"
					aria-label={`Drag ${item.name} onto a person`}
					onPointerDown={(e) => controls.start(e)}
					className="grid size-12 shrink-0 cursor-grab touch-none place-items-center text-ink-soft active:cursor-grabbing"
				>
					<GripVertical className="size-5" aria-hidden="true" />
				</button>
				<button
					type="button"
					aria-expanded={open}
					onClick={() => setOpen((o) => !o)}
					className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
				>
					<span className="min-w-0 flex-1">
						<span className="block font-semibold break-words">{item.name}</span>
						<span className="block text-[0.85rem] text-ink-soft">
							{owners.length === 0
								? "Nobody yet. Drag it onto someone."
								: owners.length === people.length && people.length > 1
									? "Everyone"
									: owners.map((p) => p.name).join(", ")}
						</span>
					</span>
					<span className="flex shrink-0 -space-x-2">
						{owners.slice(0, 4).map((p) => (
							<Avatar
								key={p.key}
								name={p.name}
								seed={p.userId ?? p.key}
								size="sm"
								className="size-7 text-[0.65rem]"
							/>
						))}
					</span>
					<span className="num shrink-0 font-bold">
						{formatMinor(item.amountMinor, currency)}
					</span>
				</button>
			</div>
			{open && (
				<div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-3">
					{people.map((p) => {
						const on = item.people.includes(p.key);
						return (
							<button
								key={p.key}
								type="button"
								aria-pressed={on}
								onClick={() => onToggle(p.key)}
								className={cn(
									"inline-flex min-h-10 items-center gap-2 rounded-full border-2 py-1 pr-3 pl-1 text-[0.9rem] font-semibold",
									on ? "border-plum-500 bg-plum-500/12" : "border-line",
								)}
							>
								<Avatar
									name={p.name}
									seed={p.userId ?? p.key}
									size="sm"
									className="size-7 text-[0.65rem]"
								/>
								{p.name}
							</button>
						);
					})}
					<button
						type="button"
						onClick={onEveryone}
						className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[0.9rem] font-semibold"
					>
						<UsersRound className="size-4" aria-hidden="true" /> Everyone
					</button>
					<button
						type="button"
						onClick={onRemove}
						aria-label={`Remove ${item.name}`}
						className="ml-auto grid size-10 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-over"
					>
						<Trash2 className="size-5" aria-hidden="true" />
					</button>
				</div>
			)}
		</motion.li>
	);
}
