import { formatMinor } from "@spendid/shared";
import { Plus } from "lucide-react";
import { CountUp } from "@/components/money/CountUp";
import { SafeDial } from "@/components/money/SafeDial";

// Preview numbers until real data arrives in M2.
const PREVIEW = {
	currency: "MYR",
	allowance: 6000,
	remaining: 4820,
	goal: "Bali trip",
};

function greeting(date: Date): string {
	const h = date.getHours();
	if (h < 12) return "Good morning";
	if (h < 18) return "Good afternoon";
	return "Good evening";
}

export function HomePage() {
	const now = new Date();
	const day = now.toLocaleDateString(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});

	return (
		<div className="space-y-6">
			<div>
				<p className="text-ink-soft">{day}</p>
				<h1 className="mt-1 text-[clamp(2rem,7vw,2.8rem)] font-bold">
					{greeting(now)}
				</h1>
			</div>

			<section className="relative overflow-hidden rounded-panel bg-plum-900 p-6 text-plum-50 sm:p-8 dark:bg-plum-800">
				<span className="absolute top-4 right-4 rounded-full bg-white/10 px-2.5 py-1 text-[0.78rem]">
					Preview
				</span>
				<div className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
					<div>
						<p className="text-plum-200">Safe to spend today</p>
						<CountUp
							minor={PREVIEW.remaining}
							currency={PREVIEW.currency}
							className="num mt-1 block text-[clamp(3rem,13vw,4.5rem)] leading-none font-extrabold text-marigold"
						/>
						<p className="mt-3 max-w-[34ch] text-plum-200">
							That keeps you on track for {PREVIEW.goal}, with{" "}
							{formatMinor(PREVIEW.allowance, PREVIEW.currency)} set aside for
							each day.
						</p>
					</div>
					<SafeDial
						remainingMinor={PREVIEW.remaining}
						allowanceMinor={PREVIEW.allowance}
						className="mx-auto w-44"
					/>
				</div>
			</section>

			<section className="rounded-panel border border-dashed border-line p-6 text-center">
				<h2 className="text-[1.4rem] font-bold">Nothing logged today</h2>
				<p className="mx-auto mt-2 max-w-[36ch] text-ink-soft">
					Tap{" "}
					<Plus
						className="inline size-4 align-[-2px]"
						aria-label="the plus button"
					/>{" "}
					and say, snap or type your first expense.
				</p>
			</section>
		</div>
	);
}
