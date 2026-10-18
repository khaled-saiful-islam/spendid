import { useSyncExternalStore } from "react";

const subscribe = (l: () => void) => {
	window.addEventListener("online", l);
	window.addEventListener("offline", l);
	return () => {
		window.removeEventListener("online", l);
		window.removeEventListener("offline", l);
	};
};

/** Whether this device has a network connection, live. */
export function useOnline(): boolean {
	return useSyncExternalStore(subscribe, () => navigator.onLine);
}
