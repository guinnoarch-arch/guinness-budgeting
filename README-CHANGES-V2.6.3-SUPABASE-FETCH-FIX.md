# V2.6.3 Supabase Fetch Fix

## What changed

- Corrected the app-owned Supabase project URL used by the auth/cloud-backup code.
- Added `src/config/supabaseProjectConfig.js` so the app has the Supabase project details in background app config, not in the user interface.
- Updated `src/services/supabaseClient.js` so:
  - placeholder `.env` values are ignored;
  - the known previous project URL typo is corrected automatically;
  - Vercel/local `.env` values can still override the built-in config if they are real values.
- Updated auth sign-in validation so existing users are not blocked by the new-account password-strength rules when signing in.
- Cleaned the locked login form so sign-in mode only needs:
  - Email or username
  - Password
- Added clearer Supabase network error messages instead of showing only `Failed to fetch`.

## Why this was needed

The previous patch moved Supabase settings out of the UI, which was correct, but the app-owned project URL had a typo. That made the browser request the wrong Supabase host, causing the login screen to show:

> Failed to fetch

This patch corrects the project URL and adds a guard for the old typo.

## Files changed

- `src/config/supabaseProjectConfig.js`
- `src/services/supabaseClient.js`
- `src/services/authService.js`
- `src/services/cloudBackupService.js`
- `src/components/auth/CloudLoginGate.jsx`

## What this does not change

- Supabase Auth still handles passwords.
- The app still does not store passwords.
- The Supabase URL/key are still not shown in the app UI.
- Cloud backup remains local-first backup, not full live sync.
- Row Level Security still needs to be correctly set up in Supabase.

## How to apply

Copy the files in this patch over the matching files in your project.

Then run:

```bash
npm install
npm run build
npm run dev
```

## How to test

1. Open the app locally.
2. Confirm the login screen does not show Supabase URL/key fields.
3. Confirm it no longer says “Cloud login is not configured for this build.”
4. Try signing in with your email and password.
5. If email login works, try username login.
6. If username login fails but email login works, install/check the Supabase SQL function `gh_resolve_username_login`.
7. After signing in, check cloud backup status in Settings.
8. Press **Back up now** and confirm a cloud backup is created.
9. Run `npm run build` before deploying.

## If it still says it cannot reach Supabase

Check:

- internet connection;
- Supabase project is active/not paused;
- Vercel environment variables are not overriding the built-in config with an old/wrong project URL;
- browser/ad-blocker/network restrictions are not blocking Supabase requests.

For Vercel, redeploy after applying the patch.
