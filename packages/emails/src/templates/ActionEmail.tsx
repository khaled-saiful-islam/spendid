/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Link, Text } from "@react-email/components";
import { colors, Layout } from "./Layout";

export interface ActionEmailProps {
	preview: string;
	heading: string;
	body: string;
	action: string;
	url: string;
	footnote: string;
}

/** One heading, one paragraph, one big coin button — used by verify and reset emails. */
export function ActionEmail({ preview, heading, body, action, url, footnote }: ActionEmailProps) {
	return (
		<Layout preview={preview}>
			<Heading
				as="h1"
				style={{ fontSize: 28, lineHeight: "32px", color: colors.plum, margin: "0 0 12px", fontWeight: 800 }}
			>
				{heading}
			</Heading>
			<Text style={{ fontSize: 16, lineHeight: "24px", color: colors.plumSoft, margin: "0 0 24px" }}>
				{body}
			</Text>
			<Button
				href={url}
				style={{
					background: colors.marigold,
					color: colors.plum,
					fontWeight: 700,
					fontSize: 16,
					borderRadius: 999,
					padding: "14px 28px",
				}}
			>
				{action}
			</Button>
			<Text style={{ fontSize: 13, lineHeight: "20px", color: colors.plumSoft, margin: "24px 0 0" }}>
				{footnote} If the button doesn't work, open this link:{" "}
				<Link href={url} style={{ color: colors.plum, wordBreak: "break-all" }}>
					{url}
				</Link>
			</Text>
		</Layout>
	);
}
