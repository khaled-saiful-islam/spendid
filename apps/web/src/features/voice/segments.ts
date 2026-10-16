/** Joins the speech segments of one note, with a short silence between them. */
export function joinSegments(
	segments: Float32Array[],
	rate: number,
	gapSeconds = 0.3,
): Float32Array {
	if (segments.length === 0) return new Float32Array();
	if (segments.length === 1) return segments[0] ?? new Float32Array();
	const gap = Math.round(rate * gapSeconds);
	const total =
		segments.reduce((n, s) => n + s.length, 0) + gap * (segments.length - 1);
	const out = new Float32Array(total);
	let at = 0;
	for (const [i, s] of segments.entries()) {
		out.set(s, at);
		at += s.length + (i < segments.length - 1 ? gap : 0);
	}
	return out;
}
