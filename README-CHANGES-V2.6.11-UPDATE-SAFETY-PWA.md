# README Changes - V2.6.11 Update Safety And PWA Patch

## What Changed

- Fixed a storage-load fallback that could show fresh/default data after an IndexedDB load failure.
- Added a storage recovery screen instead of silently replacing unreadable saved data with example/default data.
- Recovery mode lets the user export raw browser storage, restore a JSON backup, retry loading, or explicitly start fresh.
- Added the Phone view / Desktop view toggle to the pre-login Supabase auth screen and the local profile welcome screen.
- Added compact styling for auth and recovery screens so phone users can switch layout before signing in.
- Tightened QR URL resolution so Vercel-hosted pages use `VITE_PUBLIC_APP_URL` as the stable production URL and do not share preview deployment URLs.
- Kept the manifest identity stable: `name`, `short_name`, `start_url`, `scope`, `id` and icons were not changed.
- Bumped app, data schema and service-worker cache references to V2.6.11.
- Updated README notes for update-safe local data, production QR configuration and installed PWA updates.

## Files Changed

- `README.md`
- `README-CHANGES-V2.6.11-UPDATE-SAFETY-PWA.md`
- `package.json`
- `package-lock.json`
- `public/service-worker.js`
- `src/components/auth/CloudLoginGate.jsx`
- `src/components/layout/AppShell.jsx`
- `src/components/setup/WelcomeScreen.jsx`
- `src/main.jsx`
- `src/services/storageService.js`
- `src/styles/global.css`

## Cause Found

`loadAppDataAsync()` returned `null` when IndexedDB failed to load and no legacy localStorage record was available. `main.jsx` treated that the same as a genuine first run and loaded `getInitialAppData()`. That did not delete IndexedDB by itself, but it could make an update/login look like the app had reset and could then save fresh/default state.

V2.6.11 changes this path to throw a recoverable storage-load error and show a recovery screen instead of seeding defaults automatically.

## How To Test

1. Run `npm run build`.
2. Open the app with existing local data and confirm an app version change keeps the data visible.
3. Confirm the service-worker update banner still appears in production builds when a new worker is waiting.
4. Open the app while signed out and confirm **Phone view** appears on the sign-in screen.
5. Toggle Phone view, refresh, then sign in and confirm the logged-in app remains compact.
6. Set `VITE_PUBLIC_APP_URL` to the stable production Vercel URL and confirm the QR panel shows that exact URL.
7. On a Vercel preview URL, confirm the QR panel does not use the preview origin unless the stable production URL is configured.

## Manual Vercel Step

Set this environment variable in Vercel for Production:

```text
VITE_PUBLIC_APP_URL=https://your-production-app-url.vercel.app
```

Use the stable public production app URL, not a preview deployment URL and not a Vercel dashboard URL.

## Known Limitations

- Cloud backup/restore is still not full real-time sync.
- Cloud restore from the recovery screen still requires getting back into the app/signing in; use JSON backup restore or raw export first if local storage is unreadable.
- If a user installed the PWA from a preview URL, they should reinstall once from the stable production URL so browser identity and scope are correct going forward.
