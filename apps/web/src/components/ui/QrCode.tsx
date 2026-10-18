import { encode } from "uqr";

/**
 * A scannable QR code drawn as one SVG path. Always dark-on-white so every phone camera
 * reads it, whatever the app theme.
 */
export function QrCode({ text, label }: { text: string; label: string }) {
	const { data, size } = encode(text, { ecc: "M", border: 2 });
	let d = "";
	data.forEach((row, y) => {
		row.forEach((on, x) => {
			if (on) d += `M${x} ${y}h1v1h-1z`;
		});
	});
	return (
		<svg
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label={label}
			shapeRendering="crispEdges"
			className="aspect-square w-full max-w-56 rounded-tile bg-white p-1 shadow-lift"
		>
			<rect width={size} height={size} fill="#ffffff" />
			<path d={d} fill="#170b26" />
		</svg>
	);
}
