# Install as an app (PWA)

Spendid installs to the home screen on phones and as a desktop app. The service worker only runs
in the production build (`docker-compose.prod.yml`), not in `make up`, so hot reload stays simple.

## Install

- **iPhone (Safari)**: Share → *Add to Home Screen*.
- **Android (Chrome)**: menu → *Install app* (or the install banner).
- **Desktop Chrome / Edge**: the install icon in the address bar.

## What works offline

- The app shell opens and shows an "You're offline" banner.
- Money data is **never** cached (`/api/*` always goes to the server), so nothing personal is left
  on a shared device and numbers are never stale.
- Built assets are cached forever (their names change on every build); `index.html`, `sw.js` and
  the manifest are always checked for updates.

## Files

| File | What |
|---|---|
| `apps/web/public/manifest.webmanifest` | Name, colours, icons, start URL `/app` |
| `apps/web/public/sw.js` | Shell + asset cache, skips `/api` |
| `apps/web/public/icons/` | 192, 512, maskable 512, Apple touch icon |
| `apps/web/src/components/system/OfflineBanner.tsx` | The offline notice |

Camera, microphone and passkeys need HTTPS on phones; production gets it from Caddy (see `deploy.md`).
