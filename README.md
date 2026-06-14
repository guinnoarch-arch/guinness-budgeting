# Guinness & Holley Budgeting

Local-first React/Vite budgeting app for personal, student and household budgeting.

## Current Version

V2.6.22 - Supabase admin SQL setup source aligned with Admin Control Centre user management.

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

The Admin Control Centre route is:

```text
/admin
```

You can also open it from `Settings -> Profile` after your Supabase profile has admin access.

Admin access is stored in Supabase, not in a frontend-only allowlist:

```text
public.profiles.role = 'admin'
```

The browser still uses only the Supabase anon/publishable key. Do not add service-role keys to frontend code or Vercel client environment variables.

For first setup, run the current SQL shown in `Settings -> Cloud backup -> Show Supabase SQL setup`, or paste the repository file `supabase-admin-control-centre.sql` into the Supabase SQL Editor. It adds `profiles.role`, `profiles.blocked`, admin claim mode, server-side RPC route guards, safe admin user-management RPCs and an admin audit log. When no admin exists, a signed-in user will see `Become admin` in `Settings -> Profile`. A successful claim marks that user's Supabase profile as admin and automatically turns admin-claim mode off.

Existing admins can temporarily enable `Allow another user to become admin` inside `/admin`, but normal admin promotion/demotion now happens in `/admin -> Users / Accounts`. Admins can promote, demote, block and unblock accounts through Supabase RPCs. Blocked users see `Your account has been blocked. Contact the app admin.` and cannot open the private budgeting area or cloud backup/restore paths while blocked. Non-admin users who open `/admin` directly are shown `Not authorised` and a button back to Settings.

The Admin Control Centre users table depends on the no-argument RPC `public.gh_admin_list_users()`. If the app says `Admin SQL setup has not been run yet`, run `supabase-admin-control-centre.sql`, wait 30-60 seconds for the PostgREST schema cache, then refresh the app. Until that RPC succeeds, the UI intentionally hides user totals rather than showing misleading counts.

Admin SQL setup steps:

1. Open the Supabase SQL Editor.
2. Paste and run the latest SQL from `Settings -> Cloud backup -> Show Supabase SQL setup`, or run `supabase-admin-control-centre.sql`.
3. Wait 30-60 seconds for the PostgREST schema cache.
4. Refresh the app.
5. Open `Admin Control Centre -> Users / Accounts`.

Troubleshooting:

- `function not found`: wait 30-60 seconds after running SQL, then refresh.
- `schema cache`: Supabase has not refreshed the new RPC definitions yet.
- `Not authorised`: the signed-in profile must have `public.profiles.role = 'admin'`.
- No admin exists: sign in and use `Settings -> Profile -> Become admin` if admin claim mode is allowed.
- Blocked account: ask an existing admin to unblock the profile from `Users / Accounts`.

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
