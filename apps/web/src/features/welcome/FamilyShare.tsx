import { PauseCircle, ShieldCheck } from "lucide-react";

const PEOPLE = [
	{
		initials: "AI",
		name: "Aisha",
		relation: "Wife",
		sees: "Sees your categories",
		color: "bg-pink-400",
	},
	{
		initials: "MA",
		name: "Mak",
		relation: "Mother",
		sees: "Sees totals only",
		color: "bg-sky-400",
	},
	{
		initials: "DA",
		name: "Danial",
		relation: "Son",
		sees: "Shares his allowance with you",
		color: "bg-jade",
	},
];

export function FamilyShare() {
	return (
		<section aria-labelledby="family-title" className="bg-scales">
			<div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-2">
				<div>
					<h2
						id="family-title"
						className="max-w-[16ch] text-[clamp(2rem,6vw,3.4rem)] font-bold"
					>
						Share with family, on your terms.
					</h2>
					<p className="mt-4 max-w-[48ch] text-[1.1rem] text-ink-soft">
						Invite your partner, parents or kids with a link. Each of you
						chooses what the other sees, from a single total to every receipt.
					</p>
					<ul className="mt-6 space-y-3 text-[1rem]">
						<li className="flex gap-3">
							<ShieldCheck
								className="mt-0.5 size-5 shrink-0 text-safe"
								aria-hidden="true"
							/>
							Both of you agree before anything is shared.
						</li>
						<li className="flex gap-3">
							<PauseCircle
								className="mt-0.5 size-5 shrink-0 text-safe"
								aria-hidden="true"
							/>
							Pause or stop sharing at any time, and they are told.
						</li>
					</ul>
				</div>

				<ul className="space-y-3" aria-label="Example family circle">
					{PEOPLE.map((p) => (
						<li
							key={p.name}
							className="flex flex-wrap items-center gap-4 rounded-panel bg-surface p-4 shadow-lift"
						>
							<span
								className={`grid size-12 shrink-0 place-items-center rounded-full font-display font-bold text-plum-900 ${p.color}`}
								aria-hidden="true"
							>
								{p.initials}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block font-semibold">{p.name}</span>
								<span className="block text-[0.9rem] text-ink-soft">
									{p.relation}
								</span>
							</span>
							<span className="rounded-full bg-surface-2 px-3 py-1.5 text-[0.85rem] font-medium">
								{p.sees}
							</span>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
