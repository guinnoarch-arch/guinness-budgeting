# V2.6.2 Auth Config Patch

## What changed

- Added app-owned Supabase configuration in `src/config/supabaseProjectConfig.js`.
- Updated `src/services/supabaseClient.js` so the app uses Vite environment variables first, then the app-owned Supabase defaults.
- The login screen no longer depends on Supabase URL/key values being saved in app data.
- The Supabase URL and anon/public key remain hidden from the app UI.
- Cleaned the locked login form so normal sign-in only shows:
  - Email or username
  - Password
- Create account mode still shows:
  - Email
  - Username
  - Password
  - Confirm password
- Sign-in password validation now only checks that a password was entered. Password strength rules still apply when creating a new account.

## Why this was needed

The app had correctly removed editable Supabase URL/key fields from the user interface, but it then relied only on environment variables. In the current local/prod build those variables were not present, so the login screen showed:

> Cloud login is not configured for this build.

This patch makes Supabase an app-level background configuration instead of a user setting.

## Files changed

- `src/config/supabaseProjectConfig.js`
- `src/services/supabaseClient.js`
- `src/services/authService.js`
- `src/components/auth/CloudLoginGate.jsx`

## Notes

- Supabase Auth still handles real password checking.
- The app still does not store passwords.
- The app still does not store Supabase keys in user settings/local app data.
- Vercel environment variables can still override the app-owned defaults if needed later.
- Row Level Security in Supabase still needs to be correctly set up so users can only access their own cloud-backup rows.

## How to test

1. Run `npm install` if dependencies are missing or the uploaded `node_modules` folder is broken.
2. Run `npm run build`.
3. Start the app locally with `npm run dev`.
4. Open the app in a browser.
5. Confirm the locked login screen no longer shows “Cloud login is not configured for this build.”
6. Confirm the login screen does not show Supabase URL/key fields.
7. Confirm sign-in mode only shows Email or username + Password.
8. Confirm create-account mode shows Email + Username + Password + Confirm password.
9. Sign in using email/password.
10. Sign out and sign in using username/password if the Supabase username resolver SQL has been installed.
11. Confirm cloud backup buttons still work after sign-in.

## Deployment note

For Vercel, redeploy after applying this patch. Existing Vercel environment variables are still supported, but this patch no longer requires the user to paste Supabase configuration into the app UI.
