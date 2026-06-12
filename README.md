# Guinness & Holley Budgeting

Local-first React/Vite budgeting app for personal, student and household budgeting.

## Current Version

V2.6.16 - reliable phone QR rendering, guarded Control Centre and admin feature flags.

## What Is Included

- React/Vite app structure
- Dashboard, accounts, budgets, bills, savings, loans, reports and transactions
- Add/edit/delete transactions with CSV import and import rules
- Local IndexedDB storage with localStorage fallback/recovery support
- Full JSON backup export and restore with preview and validation
- Supabase Auth cloud backup/restore support
- Local/offline fallback behaviour after the production service worker is registered
- Progressive Web App manifest, app icons and install/update prompts
- Open-on-phone QR panel for the public deployed app URL
- Manual compact Phone view mode plus responsive small-screen CSS
- Storage recovery screen if browser storage cannot be read safely
- Admin-only Control Centre for safe status checks, feature flags and a local audit log

## Local-First Storage

The app saves working data locally in the browser first. Supabase is used for sign-in and cloud backup/restore, not full live database sync.

For a phone or new device:

1. Open the public deployed app URL.
2. Sign in with the same Supabase account.
3. Restore the latest cloud backup if this device needs the existing data.
4. Continue using the app locally and back up again when needed.

Local JSON backup remains the safest portable recovery copy.

App updates should not clear local data. If browser storage cannot be read after an update, the app shows a recovery screen instead of loading defaults over existing data. Export raw storage before resetting or starting fresh.

## Install And Run For Development

1. Install Node.js if needed.
2. Run:

```bash
npm install
npm run dev
```

3. Open the local Vite URL, usually:

```bash
http://localhost:5173
```

Set `VITE_PUBLIC_APP_URL` in `.env` and in Vercel Production environment variables to the stable public production app URL:

```text
VITE_PUBLIC_APP_URL=https://guinness-budgeting.vercel.app
```

The phone QR panel prefers this value. If it is missing, the app treats `https://guinness-budgeting.vercel.app` as the stable production URL and otherwise falls back safely to the current browser origin. Localhost, private-network URLs, Vercel preview URLs and the Vercel dashboard show a warning and use the stable production link instead of leaving the QR/link blank.

For Vercel, set this in **Project Settings -> Environment Variables** for the Production environment:

```text
VITE_PUBLIC_APP_URL=https://guinness-budgeting.vercel.app
```

The QR code is generated as a standard SVG from the resolved production URL. If you test from a Vercel preview deployment, the QR deliberately encodes the stable production URL rather than the preview URL.

## Admin Control Centre

The Control Centre is only shown to signed-in admin users. Admin status is read from Supabase user metadata (`admin: true`, `role: admin`, `role: owner` or `role: super_admin`) or from a non-secret frontend allowlist:

```text
VITE_ADMIN_EMAILS=first@example.com,second@example.com
```

Use `VITE_ADMIN_EMAILS` only as a UI allowlist. It is bundled into frontend code and must not be treated as a backend security boundary. Cross-user admin stats or actions should be added later through a secure Supabase RPC or server route with Row Level Security, never by putting a service-role key in the browser.

The bank-linking feature flag defaults to off and does not enable any live bank integration.

## Production Build And PWA Test

The service worker is registered only in production builds. Run:

```bash
npm run build
npm run preview
```

Then open the preview URL shown in the terminal. In Chrome or Edge, the browser may show an install icon in the address bar. You can also use:

```text
Settings -> Install app and offline mode
```

Installed PWA updates use the normal service-worker flow. After deploying to Vercel, open the installed app, wait for the **Update available** banner, export a backup if prompted, then click **Update app**. The app also checks for updates when it opens, comes back online, and returns to the foreground. The manifest keeps a stable `name`, `short_name`, `start_url`, `scope`, `id` and icon set so the browser should treat it as the same installed app.

## Backup And Restore

Go to:

```text
Settings -> Data backup and restore
```

Use **Export full backup** to download a `.json` backup. Use **Import / restore backup** to preview and restore a previous backup. Restoring replaces the current local data in that browser.

Cloud backup is available after Supabase sign-in:

```text
Settings -> Cloud backup
```

Preview counts before restoring cloud data, especially on a phone or new device.

## Supabase Security

Frontend code must use only the Supabase anon/publishable key. Do not add service-role or secret keys to this repo.

The SQL setup shown in Settings enables Row Level Security so each signed-in user can access only their own profile and cloud-backup rows.
