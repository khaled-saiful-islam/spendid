import type { ReactNode } from "react";

/**
 * Every signed-in page opens the same way: one title size, in one place, with an optional
 * line under it and an optional action on the right. Change the look here, not per page.
 */
export function PageHeader({
	title,
	sub,
	lead,
	aside,
}: {
	title: ReactNode;
	sub?: ReactNode;
	/** Something that belongs to the title itself, such as a person's avatar. */
	lead?: ReactNode;
	aside?: ReactNode;
}) {
	return (
		<header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				{lead}
				<div className="min-w-0">
					<h1 className="text-[1.75rem] leading-tight font-bold break-words sm:text-[2rem]">
						{title}
					</h1>
					{sub && (
						<div className="mt-1 max-w-[56ch] text-[0.95rem] text-ink-soft">
							{sub}
						</div>
					)}
				</div>
			</div>
			{aside}
		</header>
	);
}
