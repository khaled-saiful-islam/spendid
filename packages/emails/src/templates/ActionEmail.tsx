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
	/** Optional fact table above the button. */
	rows?: { label: string; value: string }[];
	/** Optional emails carry a way out. */
	unsubscribeUrl?: string;
}

/** One heading, one paragraph, one big coin button — used by verify and reset emails. */
export function ActionEmail({ preview, heading, body, action, url, footnote, rows = [], unsubscribeUrl }: ActionEmailProps) {
	return (
		<Layout preview={preview}>
			<Heading
				as="h1"
				style={{ fontSize: 28, lineHeight: "32px", color: colors.plum, margin: "0 0 12px", fontWeight: 800 }}
			>
				{heading}
			</Heading>
			{body.split("\n").map((para) => (
				<Text key={para} style={{ fontSize: 16, lineHeight: "24px", color: colors.plumSoft, margin: "0 0 16px" }}>
					{para}
				</Text>
			))}
			{rows.length > 0 && (
				<table
					role="presentation"
					style={{ width: "100%", borderCollapse: "collapse", margin: "4px 0 24px", background: colors.paper, borderRadius: 16 }}
				>
					<tbody>
						{rows.map((r) => (
							<tr key={r.label}>
								<td style={{ padding: "10px 16px", fontSize: 15, color: colors.plumSoft }}>{r.label}</td>
								<td style={{ padding: "10px 16px", fontSize: 15, color: colors.plum, fontWeight: 700, textAlign: "right" }}>
									{r.value}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
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
			{unsubscribeUrl && (
				<Text style={{ fontSize: 13, lineHeight: "20px", color: colors.plumSoft, margin: "16px 0 0" }}>
					Don't want these?{" "}
					<Link href={unsubscribeUrl} style={{ color: colors.plum }}>
						Turn them off
					</Link>{" "}
					or choose which emails you get in Spendid's settings.
				</Text>
			)}
		</Layout>
	);
}
