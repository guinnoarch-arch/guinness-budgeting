# Guinness & Holley Budgeting

Local-first React/Vite budgeting app for personal, student and household budgeting.

## Current Version

V2.6.13 - phone header cleanup, compact Settings descriptions and PWA update polish.

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

Set `VITE_PUBLIC_APP_URL` in `.env` and in Vercel project environment variables to the stable public production app URL. The phone QR panel uses this value on localhost and Vercel-hosted pages so phones do not open localhost, a Vercel preview deployment, or the Vercel dashboard.

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
