/**
 * How strong a new password looks, 0 to 4: 0 is under the 8-character minimum. Length
 * counts most, so a short sentence ("kopi panas 2 gelas") beats a short jumble.
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
	if (password.length < 8) return 0;
	const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) =>
		r.test(password),
	).length;
	let score = 1;
	if (kinds >= 2) score += 1;
	if (password.length >= 12) score += 1;
	if (password.length >= 16) score += 1;
	return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}
