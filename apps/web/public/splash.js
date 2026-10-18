// Show the animated splash when Spendid starts as the installed app (or with ?splash for a
// look in a browser tab). A file rather than an inline script, for the Content-Security-Policy.
try {
	const installed =
		matchMedia("(display-mode: standalone)").matches ||
		navigator.standalone === true;
	if (installed || new URLSearchParams(location.search).has("splash"))
		document.documentElement.classList.add("splashing");
} catch {}
