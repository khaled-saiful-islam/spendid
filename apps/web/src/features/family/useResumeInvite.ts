import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { pendingInvite } from "@/lib/pending-invite";

/** After sign-up and onboarding, take the person back to the invite they opened. */
export function useResumeInvite(): void {
	const navigate = useNavigate();
	useEffect(() => {
		const token = pendingInvite.get();
		if (token) void navigate({ to: "/join/$token", params: { token } });
	}, [navigate]);
}
