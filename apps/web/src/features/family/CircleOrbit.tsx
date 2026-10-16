import type { FamilyPerson } from "@spendid/shared";
import { Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Avatar } from "./parts";

const SPIN_S = 70;

/**
 * Me in the middle, my people orbiting slowly around me. Open seats (pending invites or
 * empty places) are dashed. The ring turns; each face counter-turns to stay upright.
 */
export function CircleOrbit({
	me,
	people,
	openSeats,
}: {
	me: { name: string; id: string };
	people: FamilyPerson[];
	openSeats: number;
}) {
	const reduce = useReducedMotion();
	const seats = [
		...people.map((p) => ({
			kind: "person" as const,
			key: p.userId,
			person: p,
		})),
		...Array.from({ length: openSeats }, (_, i) => ({
			kind: "open" as const,
			key: `open-${i}`,
			person: null,
		})),
	];
	const spin = reduce ? undefined : { rotate: 360 };
	const counter = reduce ? undefined : { rotate: -360 };
	const loop = {
		repeat: Number.POSITIVE_INFINITY,
		duration: SPIN_S,
		ease: "linear" as const,
	};

	return (
		<div
			className="relative mx-auto aspect-square w-full max-w-[18rem]"
			aria-hidden="true"
		>
			<div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--color-marigold)_0,transparent_45%),radial-gradient(circle_at_75%_70%,var(--color-jade)_0,transparent_45%),radial-gradient(circle_at_50%_50%,var(--color-plum-500)_0,transparent_70%)] opacity-30 blur-2xl" />
			<div className="absolute inset-[14%] rounded-full border-2 border-dashed border-plum-300/60" />
			<div className="absolute inset-[30%] rounded-full border border-plum-300/40" />
			<motion.div className="absolute inset-0" animate={spin} transition={loop}>
				{seats.map((seat, i) => {
					const angle =
						(i / Math.max(seats.length, 1)) * Math.PI * 2 - Math.PI / 2;
					const x = 50 + 36 * Math.cos(angle);
					const y = 50 + 36 * Math.sin(angle);
					return (
						<motion.div
							key={seat.key}
							className="absolute -translate-x-1/2 -translate-y-1/2"
							style={{ left: `${x}%`, top: `${y}%` }}
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							transition={{
								delay: 0.15 + i * 0.08,
								type: "spring",
								stiffness: 260,
								damping: 18,
							}}
						>
							<motion.div animate={counter} transition={loop}>
								{seat.person ? (
									<Avatar
										name={seat.person.name}
										seed={seat.person.userId}
										size="md"
										className="shadow-lift"
									/>
								) : (
									<span className="grid size-12 place-items-center rounded-full border-2 border-dashed border-plum-300 bg-surface/70 text-plum-500">
										<Plus className="size-5" />
									</span>
								)}
							</motion.div>
						</motion.div>
					);
				})}
			</motion.div>
			<div className="absolute inset-0 grid place-items-center">
				<motion.div
					animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
					transition={{
						repeat: Number.POSITIVE_INFINITY,
						duration: 4,
						ease: "easeInOut",
					}}
				>
					<Avatar
						name={me.name}
						seed={me.id}
						size="lg"
						className="shadow-coin ring-4"
					/>
				</motion.div>
			</div>
		</div>
	);
}
