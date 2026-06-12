# README Changes - V2.6.13 Phone Header Settings PWA Patch

## What Changed

- Cleaned the phone-mode header:
  - Online/offline/local status now appears beside the app welcome text in phone mode.
  - The separate status pill is hidden from the phone header button row.
  - Logout is hidden from the phone header and is available in Settings -> Profile.
  - Backup Now is hidden from the phone header unless the backup reminder is urgent/danger.
- Changed header mode controls to icon buttons:
  - Moon/sun icons for theme switching.
  - Phone/laptop icons for compact/desktop view switching.
  - Accessible labels and titles are retained.
- Made Settings section descriptions more compact:
  - Grey descriptive text under Settings headings is hidden while a section is closed.
  - The text is still visible after the section is expanded.
- Preserved the existing PWA update behaviour from V2.6.12:
  - Stable manifest identity.
  - User-controlled Update app action.
  - Service-worker cache bump to V2.6.13.
- Kept the sign-in page cleanup from V2.6.12:
  - No large orange local-first/local-only boxes on the auth screen.
  - Auth forms remain scrollable in phone mode.
- Bumped app, data schema and service-worker cache references to V2.6.13.

## Files Changed

- `README.md`
- `README-CHANGES-V2.6.13-PHONE-HEADER-SETTINGS-PWA.md`
- `package.json`
- `package-lock.json`
- `public/service-worker.js`
- `src/components/layout/AppShell.jsx`
- `src/pages/SettingsPage.jsx`
- `src/services/storageService.js`
- `src/styles/global.css`

## How To Test

1. Run `npm install` if dependencies are missing.
2. Run `npm run build`.
3. Open the app on desktop and confirm the header still works normally.
4. Switch to Phone view.
5. Confirm Online/Offline appears next to the app heading/welcome text.
6. Confirm Logout is not in the phone header and appears in Settings -> Profile.
7. Confirm Backup Now is not always in the phone header; it should return only for danger-level backup urgency.
8. Confirm theme and phone/desktop mode buttons use icons with usable hover titles.
9. Open Settings and confirm closed section descriptions are hidden until each section is expanded.
10. Open the sign-in screen on a 360-430 px width and confirm the form scrolls.
11. Confirm no budget data or saved local profile identifiers are visible before sign-in.

## Installed PWA Update Check

1. Install/open the PWA from the stable production Vercel URL or custom domain.
2. Deploy this commit.
3. Open the installed PWA.
4. Wait for the **App update available** banner.
5. Click **Update app**.
6. Confirm the app reloads without reinstalling and existing local data remains available.

If the PWA was originally installed from a Vercel preview URL, reinstall it once from the stable production URL. After that, future updates should stay in the same installed app.

## Manual Supabase And Security Checks

- Vercel Production should set `VITE_PUBLIC_APP_URL` to the stable public production URL.
- `.env`, `.env.local` and `.env.*` remain ignored; only `.env.example` should be committed.
- Supabase service-role keys must never be placed in frontend code or Vercel client env vars.
- Confirm Supabase Row Level Security limits profile and cloud-backup rows to `auth.uid()`.
- Backup restore should still be previewed and confirmed before replacing local data.

## Known Limitations

- Cloud backup/restore is still not real-time sync.
- PWA update detection depends on browser service-worker timing; opening or foregrounding the app should trigger a fresh update check.
- This patch does not add bank linking, GoCardless, payments, or money movement.
