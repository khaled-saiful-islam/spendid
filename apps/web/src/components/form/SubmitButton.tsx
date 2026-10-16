import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";

interface SubmitButtonProps {
	pending: boolean;
	children: ReactNode;
	pendingLabel?: string;
	variant?: "coin" | "ink";
}

/** Full-width submit that shows a spinner and keeps its label readable while working. */
export function SubmitButton({
	pending,
	children,
	pendingLabel,
	variant = "coin",
}: SubmitButtonProps) {
	return (
		<button
			type="submit"
			disabled={pending}
			aria-busy={pending}
			className={buttonClass(variant, "lg", "w-full")}
		>
			{pending && (
				<LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
			)}
			{pending ? (pendingLabel ?? children) : children}
		</button>
	);
}
