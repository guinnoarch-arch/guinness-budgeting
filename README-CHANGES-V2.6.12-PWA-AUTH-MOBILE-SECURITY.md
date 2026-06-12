# README Changes - V2.6.12 PWA Auth Mobile Security Patch

## What Changed

- Removed the large visible sign-in/start-screen information boxes:
  - "Local-first with cloud backup"
  - "Need to open without Supabase?"
  - "Open local-only mode"
- Stopped the pre-login auth screen from pre-filling saved local profile email/username details.
- Kept the underlying local/offline recovery logic, but removed it from the visible sign-in flow.
- Improved phone/compact auth scrolling so sign-in and create-account fields remain reachable on 360-430 px screens.
- Updated the service worker update flow so a new worker waits for the in-app **Update app** action instead of taking over immediately.
- Added service-worker update checks on app load, foreground return, online return and hourly while open.
- Made service-worker registration bypass HTTP cache with `updateViaCache: "none"`.
- Changed navigation fetches to network-first with `cache: "no-store"` so old cached HTML is less likely to trap the installed PWA.
- Preserved the PWA manifest identity. `name`, `short_name`, `id`, `scope`, `start_url` and icons were not changed.
- Bumped app, data schema and service-worker cache references to V2.6.12.

## Files Changed

- `README.md`
- `README-CHANGES-V2.6.12-PWA-AUTH-MOBILE-SECURITY.md`
- `package.json`
- `package-lock.json`
- `public/service-worker.js`
- `src/components/auth/CloudLoginGate.jsx`
- `src/services/pwaService.js`
- `src/services/storageService.js`
- `src/styles/global.css`

## Security Checks

- `.env`, `.env.local` and `.env.*` remain ignored; `.env.example` is the only env file intended for Git.
- Frontend Supabase config still uses anon/publishable keys only.
- Existing guards reject service-role/secret-looking Supabase keys in browser config.
- No `dangerouslySetInnerHTML` usage was added.
- The sign-in screen no longer displays saved profile identifiers before authentication.
- Cloud backup access still goes through authenticated Supabase requests and documented Row Level Security policies.

## How To Test

1. Run `npm install` if dependencies are missing.
2. Run `npm run build`.
3. Open the app at desktop width and confirm the sign-in screen is clean.
4. Open responsive/mobile width around 360-430 px.
5. Toggle **Phone view** before login and confirm the auth form scrolls vertically.
6. Confirm the removed orange boxes and **Open local-only mode** button are not visible on the sign-in screen.
7. Confirm no budget data, local profile email, or local profile username is shown before sign-in.
8. Sign in and confirm existing local data is still present.
9. Deploy to Vercel and open the installed PWA.
10. After a later deploy, confirm the app shows **Update available** and the **Update app** button reloads into the new version without reinstalling.

## Manual Vercel And Supabase Checks

- Set Production `VITE_PUBLIC_APP_URL` in Vercel to the stable public production URL, not a preview URL.
- Keep the PWA installed from the stable production URL. If it was installed from a preview URL, reinstall once from production.
- Confirm Supabase Row Level Security policies restrict profile and cloud-backup rows to `auth.uid()`.
- Never add service-role keys, secret keys, or private `.env` files to the repo.

## Known Limitations

- Cloud backup/restore is still not real-time sync.
- The installed PWA update banner appears when the browser detects a waiting service worker; some browsers may only check after the app is opened or brought back to the foreground.
- This patch does not add bank linking, payments, or money movement.
