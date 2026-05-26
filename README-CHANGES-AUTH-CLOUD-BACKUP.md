# Auth Cloud Backup Patch

Date: 2026-05-26

## Summary

This patch adds a Supabase Auth login gate, local-first cloud backup, and conservative cloud/local conflict handling. Local IndexedDB/localStorage recovery remains the main working store. Supabase cloud backup is an additional safety layer, not live sync.

## Files Changed

- `src/services/supabaseClient.js` - shared Supabase env/config validation and safe response parsing.
- `src/services/authService.js` - email, username, and password validation plus Supabase Auth wrappers.
- `src/services/cloudBackupService.js` - session expiry, backup metadata, latest-backup lookup, service-role key checks, and SQL setup for `profiles` plus backup RLS.
- `src/services/cloudMergeService.js` - metadata fingerprints, conservative merge preview, and possible duplicate transaction detection.
- `src/components/auth/CloudLoginGate.jsx` - login gate with Create account and Sign in forms.
- `src/components/auth/CloudConflictScreen.jsx` - cloud/local conflict choices before the dashboard opens.
- `src/main.jsx` - auth gate wiring, lock/logout actions, auto backup debounce, conflict detection, restore, and reviewed merge application.
- `src/components/layout/AppShell.jsx` - simplified header with Logout only; no signed-in email chip or separate Lock button.
- `src/pages/SettingsPage.jsx` - Settings/Data cloud status, auth controls, link-local-data confirmation, and cloud restore preview entry point.
- `src/services/storageService.js` - cloud-backup dirty flags and migration-compatible cloud settings fields.
- `.env.example` - safe public Supabase placeholders only.

## Authentication

- Supabase Auth is used for real authentication.
- The app does not store plaintext passwords.
- The app does not store hashed passwords in localStorage or app tables.
- The app does not build a custom password system.
- The sign-up screen uses email, username, password, and confirm password.
- The sign-in screen accepts email or username plus password.
- Password checking is still handled by Supabase Auth.
- Username is profile/display information and an optional lookup key. It is not an auth secret and is not used as a password.
- Email sign-in remains the safest fallback and continues to work for older accounts.
- Only the Supabase anon/public key belongs in frontend/Vercel `VITE_` env vars. Never use a service-role key in the frontend.
- Supabase URL and anon key are environment variables only. They are no longer displayed or editable in the app UI.
- Old saved Supabase URL/key values in app settings are ignored and normalised away.

## Supabase Setup

Required Vite/Vercel environment variables:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-public-key
```

In Vercel, add or update these under Project Settings -> Environment Variables, then redeploy. If either value is missing, the app shows a simple "Cloud login is not configured for this build" error instead of asking the user to paste keys into the browser.

Run the SQL shown in Settings -> Cloud backup -> Advanced / developer info -> Show Supabase SQL setup. It creates:

- `public.profiles`
- `public.gh_cloud_backups`
- Row Level Security policies
- A trigger to create a profile from Supabase Auth user metadata

The `profiles.username_normalized` column is unique, so usernames are treated case-insensitively and duplicates are blocked by Supabase. If the profile trigger rejects a duplicate username, the account creation should fail instead of silently creating ambiguous profile data.

Username sign-in uses the `gh_resolve_username_login(username_input text)` RPC to resolve a normalized username to the linked email, then signs in with Supabase Auth using that email and the supplied password. This intentionally exposes only exact username-to-email lookup through a security-definer function. If that tradeoff is not acceptable later, replace it with an Edge Function or keep email-only sign-in.

## Existing Local Data

Existing local data is preserved.

After sign-up or sign-in, the app does not upload existing local data automatically. Settings shows a confirmation action:

- Link local data and upload first backup

If accepted, the current local app data is uploaded as the first cloud backup for the signed-in account. If declined, local data remains usable and cloud backup stays unlinked.

## Cloud Backup

- Cloud backup stores a full JSON app backup linked to the authenticated Supabase user.
- Auto backup runs only after local data has been explicitly linked to the account.
- Auto backup is debounced to about 45 seconds after changes.
- Manual local JSON backup remains available.
- Cloud backup failures do not block app usage.
- Receipt/image backup remains excluded to protect free-tier storage.

## Conflict Handling

After login, the app checks the latest Supabase backup for the signed-in user and compares metadata:

- app data version
- updated time
- last backup time
- checksum/fingerprint
- transactions count
- accounts count
- categories count
- savings goals count

If local and cloud appear different, a conflict screen appears before the dashboard.

Conflict choices:

- Keep local data: continues with local data and does not overwrite cloud.
- Use cloud backup: shows confirmation, downloads/offers a local JSON backup first, then replaces local data.
- Keep both separately: preserves both and offers local JSON backup.
- Review and merge: opens a conservative merge preview.

## Review And Merge

The merge preview compares key app collections including transactions, accounts, categories, budgets, recurring items, savings goals, closed months, settings-related import/account mappings, loans, mortgage data, and migration-related records where present.

Rules:

- Stable IDs are used where possible.
- Same-ID unchanged records are kept once.
- Same-ID changed records use `updatedAt` where available.
- Same-ID records without a clear timestamp default to local and are marked as review risk.
- Different-ID transactions that look similar are flagged as possible duplicates.
- Possible duplicates show local and cloud transaction details plus the match reasons.
- The app never averages or combines transaction amounts.
- The app never silently deletes financial records.
- After merge preview, the merged result is saved locally only after confirmation.
- Uploading the merged result to cloud still requires a separate confirmation/manual backup.

This is a safety-focused review system, not full real-time multi-device sync.

## How To Test

1. Start without Supabase env vars and confirm the login gate shows a safe config message.
2. Confirm Supabase URL/key fields are not visible anywhere in login or Settings.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`, restart Vite, and confirm config is accepted.
4. Run the Supabase SQL setup from Settings -> Cloud backup -> Advanced / developer info.
5. Create an account with email, username, password, and confirm password.
6. Sign out, then sign in with email and password.
7. Sign out, then sign in with username and password.
8. Try an unknown username and confirm the app says: "No account found with that username. Try your email address instead."
9. Confirm dashboard/settings/transactions do not render before login.
10. Confirm the header does not show a signed-in email chip and only shows Logout, not both Lock and Logout.
11. Confirm existing local data remains after sign-in.
12. Confirm local data is not uploaded until choosing to link/upload it.
13. Add or edit data after linking and confirm auto backup runs after the debounce.
14. Break Supabase config/network and confirm cloud backup failure does not crash the app.
15. Create a newer cloud backup and confirm the conflict screen appears before the dashboard.
16. Test Keep local data.
17. Test Use cloud backup and confirm restore requires explicit text confirmation.
18. Test Keep both separately and confirm no overwrite occurs.
19. Test Review and merge with similar transactions and confirm possible duplicates are shown.
20. Run `npm run build` before deploying to Vercel.

## Remaining Risks And Future Work

- This is safe backup/conflict handling, not live sync.
- Review-and-merge is intentionally basic and conservative.
- A future patch can add richer per-field merge controls and tombstone/deletedAt support throughout every editable record type.
- A future patch can add a Settings control for changing the 7-day app lock expiry.
