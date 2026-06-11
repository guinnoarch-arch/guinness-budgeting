# README Changes - V2.6.10 Phone QR And Compact View Patch

## What Changed

- Fixed the open-on-phone QR flow so it uses a public deployed app URL.
- The QR panel now refuses to generate a localhost QR unless `VITE_PUBLIC_APP_URL` points to a deployed app.
- The QR panel shows the exact app URL and includes a Copy link button.
- Added a persisted Phone view / Desktop view toggle for a compact phone-friendly layout.
- Tightened spacing, buttons, cards, forms, modals and grid layouts in compact mode and on small screens.
- Clarified that Supabase is cloud backup/restore, not full live sync.
- Added phone/new-device wording: open app, sign in, preview and restore latest cloud backup if needed.
- Aligned version references to V2.6.10.
- Updated the service worker cache name to `guinness-holley-budgeting-v2.6.10-static`; older app shell caches are removed during activation.
- Added clearer Supabase setup SQL comments for anon/publishable key use and Row Level Security ownership rules.

## Files Changed

- `package.json`
- `package-lock.json`
- `README.md`
- `README-CHANGES-V2.6.10-PHONE-QR-COMPACT.md`
- `public/service-worker.js`
- `src/main.jsx`
- `src/components/layout/AppShell.jsx`
- `src/components/settings/PwaInstallCard.jsx`
- `src/pages/SettingsPage.jsx`
- `src/services/cloudBackupService.js`
- `src/services/storageService.js`
- `src/styles/global.css`

## How To Test Locally

1. Run `npm install` if dependencies are missing.
2. Run `npm run dev`.
3. Open the local Vite URL.
4. Click **Phone view** in the header and confirm the app switches to a tighter layout.
5. Refresh the browser and confirm Phone view stays enabled.
6. Click **Desktop view** to return to the normal layout.
7. Click the phone/QR button while running on localhost without `VITE_PUBLIC_APP_URL`; the panel should show a clear deployed-URL warning instead of a localhost QR.
8. Set `VITE_PUBLIC_APP_URL=https://your-vercel-app-url.vercel.app`, restart Vite, and confirm the QR panel uses that URL.

## How To Test On Vercel

1. Deploy the app publicly on Vercel.
2. Open the public app URL on a laptop.
3. Click the phone/QR button.
4. Confirm the URL text under the QR code is the public app URL, not `localhost` and not `vercel.com`.
5. Scan the QR on a phone.
6. Confirm the phone opens the GH Budgeting app login/home page and does not require Vercel sign-in.
7. Sign in and restore the latest cloud backup if the phone needs existing data.

## Known Limitations

- Phone view is a UI mode in the same app, not a separate mobile app.
- Supabase support is cloud backup/restore only; it is not full real-time sync.
- Receipt/image cloud backup remains intentionally disabled to protect quota.
- A local development server cannot be opened from most phones unless the deployed public URL fallback is configured.
