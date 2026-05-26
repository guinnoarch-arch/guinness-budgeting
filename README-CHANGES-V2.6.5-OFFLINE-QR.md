# GH Budgeting V2.6.5 — Offline access + phone QR patch

## What changed

### 1. Local/offline access fallback
- Added a local-only unlock path for devices that already have usable local budget data.
- If Supabase is unavailable, the user can open the local copy saved on that browser/device.
- Cloud backup, cloud restore and device switching stay paused until the user signs back in with Supabase.
- New devices still need Supabase sign-in first because they do not have local budget data yet.

### 2. Header connection state
- The header now shows `Local mode` when the app is opened using the local-only fallback.
- Existing Online/Offline status still remains.

### 3. Phone/device QR button
- Added a phone icon button in the header.
- Clicking it opens a small panel with:
  - QR code for the current app URL
  - copy-link button
  - open-link button
- Use this to open the same Vercel app link on a phone or another device.
- On the other device, sign in and restore the latest cloud backup.

## Files changed

- `src/main.jsx`
- `src/components/auth/CloudLoginGate.jsx`
- `src/components/layout/AppShell.jsx`
- `src/services/localAccessService.js`
- `src/styles/global.css`
- `src/config/supabaseProjectConfig.js`
- `src/services/supabaseClient.js`
- `src/services/cloudBackupService.js`
- `src/services/authService.js`

The Supabase files are included so this patch remains compatible with the earlier V2.6.4 auth/key fix.

## Important behaviour

- Supabase Auth is still the proper login system.
- The local-only fallback does not create a new password system.
- Passwords are still never stored by the app.
- Local-only mode is a temporary device unlock, not cloud sync.
- If you use local-only mode and make changes, press Backup Now once Supabase sign-in is working again.

## QR code note

The QR image is generated from the current app URL using a public QR image endpoint. The app URL is also shown in a copyable text box. If that QR service is unavailable, the copy-link button still gives the same link.

## Manual testing

1. Start the app normally.
2. Sign in with email/password.
3. Confirm the full app opens.
4. Click the phone icon in the header.
5. Confirm the QR panel opens and shows a QR code/link.
6. Copy the link and confirm it is the app URL.
7. Click Logout.
8. If the device has local data, confirm the login page shows `Open local-only mode`.
9. Click `Open local-only mode`.
10. Confirm the app opens and the header says `Local mode`.
11. Confirm transactions/dashboard still work locally.
12. Sign back in when Supabase is available and run Backup Now.
13. Run `npm run build` and deploy to Vercel.
