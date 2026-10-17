import {
	LEVEL_INFO,
	RELATION_LABELS,
	type Relation,
	SHARE_LEVELS,
	type ShareLevel,
} from "@spendid/shared";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatMoment } from "@/lib/time";

const GRADIENTS = [
	"from-plum-500 to-sky",
	"from-marigold to-coral",
	"from-jade to-sky",
	"from-coral to-plum-500",
	"from-sky to-jade",
	"from-marigold-deep to-plum-500",
];

function hash(text: string): number {
	let h = 0;
	for (const ch of text) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
	return h;
}

const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("") || "?";

const AVATAR_SIZES = {
	xs: "size-7 text-[0.65rem] ring-1",
	sm: "size-9 text-[0.8rem]",
	md: "size-12 text-[1rem]",
	lg: "size-20 text-[1.6rem]",
};

/** A person's own colour (as gradient classes), the same as their avatar. */
export const personGradient = (seed: string): string =>
	GRADIENTS[hash(seed) % GRADIENTS.length] ?? GRADIENTS[0] ?? "";

/** A person's colourful initials; the colour stays the same everywhere for them. */
export function Avatar({
	name,
	seed,
	size = "md",
	className,
}: {
	name: string;
	seed?: string;
	size?: keyof typeof AVATAR_SIZES;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid shrink-0 place-items-center rounded-full bg-linear-to-br font-bold text-white shadow-sm ring-2 ring-surface",
				GRADIENTS[hash(seed ?? name) % GRADIENTS.length],
				AVATAR_SIZES[size],
				className,
			)}
		>
			{initials(name)}
		</span>
	);
}

export const relationLabel = (r: Relation) => t(RELATION_LABELS[r]);

/** Pick what to share. Each step adds to the one before, shown as a growing stack of bars. */
export function LevelPicker({
	value,
	onChange,
	legend,
	name,
}: {
	value: ShareLevel;
	onChange: (level: ShareLevel) => void;
	legend: string;
	name: string;
}) {
	return (
		<fieldset className="space-y-2">
			<legend className="mb-2 font-semibold">{legend}</legend>
			{SHARE_LEVELS.map((level, i) => {
				const on = value === level;
				return (
					<label
						key={level}
						className={cn(
							"flex cursor-pointer items-start gap-3 rounded-tile border-2 px-4 py-3 transition-colors",
							on
								? "border-plum-500 bg-plum-500/8"
								: "border-line hover:bg-surface-2",
						)}
					>
						<input
							type="radio"
							name={name}
							value={level}
							checked={on}
							onChange={() => onChange(level)}
							className="mt-1 size-5 shrink-0 accent-[var(--color-plum-500)]"
						/>
						<span className="min-w-0 flex-1">
							<span className="block font-semibold">
								{t(LEVEL_INFO[level].label)}
							</span>
							<span className="block text-[0.9rem] text-ink-soft">
								{t(LEVEL_INFO[level].sees)}
							</span>
						</span>
						<span
							aria-hidden="true"
							className="mt-1 flex shrink-0 items-end gap-0.5"
						>
							{SHARE_LEVELS.map((l, j) => (
								<span
									key={l}
									className={cn(
										"w-1.5 rounded-full transition-colors",
										j <= i ? (on ? "bg-plum-500" : "bg-plum-300") : "bg-line",
									)}
									style={{ height: `${8 + j * 5}px` }}
								/>
							))}
						</span>
					</label>
				);
			})}
		</fieldset>
	);
}

export const sinceLabel = (iso: string) =>
	formatMoment(iso, {
		month: "short",
		year: "numeric",
	});

export const ago = (iso: string): string => {
	const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return t("{n} min ago", { n: mins });
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours} h ago`;
	return formatMoment(iso, {
		day: "numeric",
		month: "short",
	});
};
