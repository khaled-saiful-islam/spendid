// Spendid's service worker: an offline app shell, nothing more.
// Never caches /api — money and personal data always come fresh from the server.
const SHELL = "spendid-shell-v1";
const ASSETS = "spendid-assets-v1";
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/favicon.svg"];

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (request.method !== "GET" || url.origin !== self.location.origin) return;
	if (url.pathname.startsWith("/api/")) return;

	// Pages: network first, keep the newest shell, fall back to it offline.
	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((res) => {
					const copy = res.clone();
					void caches.open(SHELL).then((c) => c.put("/", copy));
					return res;
				})
				.catch(() => caches.match("/")),
		);
		return;
	}

	// Built files have content hashes: cache first, they never change.
	if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
		event.respondWith(
			caches.match(request).then(
				(hit) =>
					hit ??
					fetch(request).then((res) => {
						if (res.ok) {
							const copy = res.clone();
							void caches.open(ASSETS).then((c) => c.put(request, copy));
						}
						return res;
					}),
			),
		);
	}
});
