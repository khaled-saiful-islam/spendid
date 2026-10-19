// Spendid's service worker: an offline app shell, nothing more.
// Never caches /api — money and personal data always come fresh from the server.
const SHELL = "spendid-shell-v6";
const ASSETS = "spendid-assets-v1";
// Voice and scanner models (several MB). Bump when the VAD or OpenCV packages change.
const MODELS = "spendid-models-v1";
// A receipt shared into Spendid from another app waits here until the app picks it up.
const SHARED = "spendid-shared";
const PRECACHE = [
	"/",
	"/theme.js",
	"/splash.js",
	"/manifest.webmanifest",
	"/icons/icon-192.png",
	"/icons/badge-96.png",
	"/favicon.svg",
];

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS, MODELS, SHARED].includes(k)).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

/**
 * "Share to Spendid" from Touch 'n Go, MAE, a banking app or the gallery (installed app only).
 * A shared screenshot or PDF is kept for the app; shared text goes along in the address.
 */
async function receiveShare(request) {
	const form = await request.formData();
	const file = form.get("receipt");
	if (file && typeof file === "object" && file.size > 0) {
		const cache = await caches.open(SHARED);
		await cache.put(
			"/shared-receipt",
			new Response(file, { headers: { "content-type": file.type || "application/octet-stream", "x-name": encodeURIComponent(file.name || "receipt") } }),
		);
		return Response.redirect("/app?shared=receipt", 303);
	}
	const text = [form.get("title"), form.get("text"), form.get("url")].filter((v) => typeof v === "string" && v.trim()).join(" ").slice(0, 300);
	return Response.redirect(text ? `/app?shared=text&t=${encodeURIComponent(text)}` : "/app", 303);
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (request.method === "POST" && url.origin === self.location.origin && url.pathname === "/share-target") {
		event.respondWith(receiveShare(request));
		return;
	}
	if (request.method !== "GET" || url.origin !== self.location.origin) return;
	if (url.pathname.startsWith("/api/")) return;

	// Pages: network first, keep the newest shell, fall back to it offline.
	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((res) => {
					// Only a real page becomes the offline shell, never an error or a proxy's page.
					const html = res.headers.get("content-type")?.includes("text/html");
					if (res.ok && html) {
						const copy = res.clone();
						void caches.open(SHELL).then((c) => c.put("/", copy));
					}
					return res;
				})
				.catch(() => caches.match("/")),
		);
		return;
	}

	// The theme and splash scripts run before every page: fresh online, cached for offline.
	if (url.pathname === "/theme.js" || url.pathname === "/splash.js") {
		event.respondWith(
			fetch(request)
				.then((res) => {
					if (res.ok) {
						const copy = res.clone();
						void caches.open(SHELL).then((c) => c.put(request, copy));
					}
					return res;
				})
				.catch(() => caches.match(request)),
		);
		return;
	}

	// Built files have content hashes: cache first, they never change.
	if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
		event.respondWith(cacheFirst(request, ASSETS));
		return;
	}
	// Models load once, then voice and scanning start fast (and work on a weak signal).
	if (url.pathname.startsWith("/vad/") || url.pathname.startsWith("/cv/")) {
		event.respondWith(cacheFirst(request, MODELS));
	}
});

function cacheFirst(request, cacheName) {
	return caches.match(request).then(
		(hit) =>
			hit ??
			fetch(request).then((res) => {
				if (res.ok) {
					const copy = res.clone();
					void caches.open(cacheName).then((c) => c.put(request, copy));
				}
				return res;
			}),
	);
}

// Phone notifications (web push): show what the server sent; tapping opens the right screen.
self.addEventListener("push", (event) => {
	let data = { title: "Spendid", body: "", url: "/app" };
	try {
		data = { ...data, ...event.data.json() };
	} catch {
		// A message we can't read still shows something rather than nothing.
	}
	event.waitUntil(
		self.registration.showNotification(data.title, {
			body: data.body,
			// The coin in full colour beside the message; the status bar only draws a badge's
			// shape, so that one is a white "S" coin on transparent.
			icon: new URL("/icons/icon-192.png", self.location.origin).href,
			badge: new URL("/icons/badge-96.png", self.location.origin).href,
			data: { url: data.url },
			tag: data.url,
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url || "/app", self.location.origin).href;
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
			const app = open.find((c) => c.url.startsWith(self.location.origin));
			if (app) return app.focus().then(() => app.navigate(target));
			return self.clients.openWindow(target);
		}),
	);
});
