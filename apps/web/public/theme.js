// Apply the saved theme before first paint to avoid a flash.
// A file rather than an inline script, so the Content-Security-Policy can forbid inline scripts.
try {
	const t = localStorage.getItem("spendid-theme");
	const dark =
		t === "dark" ||
		(t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch {}
