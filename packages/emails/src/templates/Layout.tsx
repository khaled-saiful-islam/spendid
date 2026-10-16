/** @jsxRuntime automatic */
/** @jsxImportSource react */
import {
	Body,
	Container,
	Head,
	Html,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export const colors = {
	plum: "#2A1446",
	plumSoft: "#5B4D72",
	paper: "#F6F3FC",
	marigold: "#FFB224",
	line: "#DDD3EE",
};

const font =
	"'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

interface LayoutProps {
	preview: string;
	children: ReactNode;
}

/** Shared frame: coin mark, white card on lilac paper, quiet footer. */
export function Layout({ preview, children }: LayoutProps) {
	return (
		<Html lang="en">
			<Head>
				<meta name="color-scheme" content="light only" />
			</Head>
			<Preview>{preview}</Preview>
			<Body style={{ background: colors.paper, fontFamily: font, margin: 0, padding: "32px 12px" }}>
				<Container style={{ maxWidth: 520, margin: "0 auto" }}>
					<Text style={{ fontSize: 22, fontWeight: 800, color: colors.plum, margin: "0 0 20px" }}>
						<span
							style={{
								display: "inline-block",
								width: 28,
								height: 28,
								borderRadius: 14,
								background: colors.marigold,
								color: colors.plum,
								textAlign: "center",
								lineHeight: "28px",
								fontSize: 17,
								marginRight: 8,
								verticalAlign: "middle",
							}}
						>
							S
						</span>
						<span style={{ verticalAlign: "middle" }}>Spendid</span>
					</Text>
					<Section
						style={{
							background: "#FFFFFF",
							borderRadius: 24,
							border: `1px solid ${colors.line}`,
							padding: "32px 28px",
						}}
					>
						{children}
					</Section>
					<Text style={{ fontSize: 13, color: colors.plumSoft, margin: "20px 4px 0", lineHeight: "20px" }}>
						Spendid never asks for your password by email. If something looks off, ignore this message.
					</Text>
				</Container>
			</Body>
		</Html>
	);
}
