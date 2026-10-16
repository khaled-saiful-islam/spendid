/** Four corners, each [x, y] in 0..1 of the frame, ordered TL, TR, BR, BL. */
export type Quad = [number, number][];

/** Largest distance any corner moved between two detections (0..1 of the frame). */
export function quadMovement(a: Quad, b: Quad): number {
	let max = 0;
	for (let i = 0; i < 4; i++) {
		const p = a[i];
		const q = b[i];
		if (!p || !q) return 1;
		max = Math.max(max, Math.hypot(p[0] - q[0], p[1] - q[1]));
	}
	return max;
}

/** Share of the frame the quad covers (shoelace formula). */
export function quadArea(q: Quad): number {
	let sum = 0;
	for (let i = 0; i < q.length; i++) {
		const [x1, y1] = q[i] ?? [0, 0];
		const [x2, y2] = q[(i + 1) % q.length] ?? [0, 0];
		sum += x1 * y2 - x2 * y1;
	}
	return Math.abs(sum) / 2;
}

/**
 * Maps frame coordinates to screen pixels for a video shown with `object-fit: cover`
 * (the frame is scaled to fill and centred, so edges may be cut off).
 */
export function coverTransform(
	video: { w: number; h: number },
	box: { w: number; h: number },
) {
	const scale = Math.max(box.w / video.w, box.h / video.h);
	const dx = (box.w - video.w * scale) / 2;
	const dy = (box.h - video.h * scale) / 2;
	return ([x, y]: [number, number]): [number, number] => [
		x * video.w * scale + dx,
		y * video.h * scale + dy,
	];
}

/** Steadiness tracker for auto-capture: counts consecutive near-identical detections. */
export function createSteadiness(opts: {
	frames: number;
	maxMove: number;
	minArea: number;
}) {
	let previous: Quad | null = null;
	let count = 0;
	return {
		/** Feed each detection; returns progress 0..1 (1 = steady enough to capture). */
		push(quad: Quad | null): number {
			if (!quad || quadArea(quad) < opts.minArea) {
				previous = null;
				count = 0;
				return 0;
			}
			count =
				previous && quadMovement(previous, quad) <= opts.maxMove
					? count + 1
					: 0;
			previous = quad;
			return Math.min(1, count / opts.frames);
		},
		reset() {
			previous = null;
			count = 0;
		},
	};
}
