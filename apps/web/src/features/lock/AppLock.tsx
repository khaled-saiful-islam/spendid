import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Fingerprint, Lock } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { MaybeAlert } from "@/components/form/Alert";
import { buttonClass } from "@/components/ui/Button";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { lockStorage, shouldLock } from "./policy";

function currentlyLocked(hiddenAt: number | null): boolean {
	return shouldLock(
		{
			enabled: lockStorage.isEnabled(),
			unlockedThisVisit: lockStorage.wasUnlocked(),
			hiddenAt,
		},
		Date.now(),
	);
}

/** Hides the app behind a passkey prompt when app lock is on. Nothing behind it is rendered. */
export function AppLock({ children }: { children: ReactNode }) {
	const [locked, setLocked] = useState(() => currentlyLocked(null));
	const hiddenAt = useRef<number | null>(null);

	useEffect(() => {
		const onVisibility = () => {
			if (document.hidden) {
				hiddenAt.current = Date.now();
				return;
			}
			if (currentlyLocked(hiddenAt.current)) {
				lockStorage.setUnlocked(false);
				setLocked(true);
			}
			hiddenAt.current = null;
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, []);

	if (!locked) return <>{children}</>;
	return (
		<LockScreen
			onUnlocked={() => {
				lockStorage.setUnlocked(true);
				setLocked(false);
			}}
		/>
	);
}

function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);

	async function unlock() {
		setError(null);
		const result = await authClient.signIn.passkey();
		if (result?.error)
			return setError(t("That didn't work. Try again, or use your password."));
		onUnlocked();
	}

	async function usePassword() {
		await authClient.signOut();
		queryClient.clear();
		await navigate({ to: "/signin" });
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="lock-title"
			className="bg-scales fixed inset-0 z-50 grid place-items-center bg-plum-900 px-6 text-plum-50 dark:bg-plum-950"
		>
			<div className="w-full max-w-sm text-center">
				<Logo className="justify-center" />
				<motion.div
					initial={{ scale: 0.8, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					className="mx-auto mt-12 grid size-24 place-items-center rounded-full bg-marigold text-plum-900 shadow-coin"
				>
					<Lock className="size-10" aria-hidden="true" />
				</motion.div>
				<h1 id="lock-title" className="mt-8 text-[2rem] font-extrabold">
					{t("Spendid is locked")}
				</h1>
				<p className="mt-2 text-plum-200">
					{t("Use your fingerprint, face or device PIN to open it.")}
				</p>
				<div className="mt-8 space-y-3 text-left">
					<MaybeAlert tone="error" message={error} />
					<button
						type="button"
						onClick={unlock}
						className={buttonClass("coin", "lg", "w-full")}
					>
						<Fingerprint className="size-5" aria-hidden="true" /> {t("Unlock")}
					</button>
					<button
						type="button"
						onClick={usePassword}
						className="h-11 w-full font-medium text-plum-200 hover:text-white"
					>
						{t("Use my password instead")}
					</button>
				</div>
			</div>
		</div>
	);
}
