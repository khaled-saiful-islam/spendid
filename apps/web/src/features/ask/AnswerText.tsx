import { Fragment, type ReactNode } from "react";

/** **bold** → <strong>; everything else stays text (React escapes it — no HTML from the model). */
function inline(text: string): ReactNode[] {
	return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
		part.startsWith("**") && part.endsWith("**") ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
			<strong key={i}>{part.slice(2, -2)}</strong>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
			<Fragment key={i}>{part}</Fragment>
		),
	);
}

/** Paragraphs and "- " bullet lists from the assistant's plain text. */
export function AnswerText({ text }: { text: string }) {
	const blocks: { kind: "p" | "ul"; lines: string[] }[] = [];
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		const bullet = /^[-*•]\s+/.test(line);
		const last = blocks.at(-1);
		if (bullet && last?.kind === "ul")
			last.lines.push(line.replace(/^[-*•]\s+/, ""));
		else if (bullet)
			blocks.push({ kind: "ul", lines: [line.replace(/^[-*•]\s+/, "")] });
		else blocks.push({ kind: "p", lines: [line] });
	}
	return (
		<div className="space-y-2 leading-relaxed">
			{blocks.map((b, i) =>
				b.kind === "ul" ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: blocks have no stable id
					<ul key={i} className="list-disc space-y-1 pl-5">
						{b.lines.map((l) => (
							<li key={l}>{inline(l)}</li>
						))}
					</ul>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: blocks have no stable id
					<p key={i}>{inline(b.lines.join(" "))}</p>
				),
			)}
		</div>
	);
}
