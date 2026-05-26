# V2.6.4 Supabase key/source-of-truth fix

## What changed

This patch fixes the login error where the app showed **Invalid API key** after pressing **Sign in**.

The app now uses the Guinness & Holley Budgeting Supabase project values from background app code, not from UI fields and not from accidental/old localStorage settings.

## Files changed

- `src/config/supabaseProjectConfig.js`
  - Adds the app-owned Supabase project URL and browser-safe publishable key.
- `src/services/supabaseClient.js`
  - Uses the app-owned Supabase config as the default source of truth.
  - Stops bad/missing Vercel/local env vars from breaking login unless `VITE_SUPABASE_USE_ENV_OVERRIDE=true` is deliberately set.
  - Corrects known previous key/URL typo variants.
  - Improves the Invalid API key error message.
- `src/services/cloudBackupService.js`
  - Avoids using `sb_publishable_...` as an Authorization bearer token for anonymous REST/RPC calls.
  - Keeps authenticated REST calls scoped to the signed-in user's access token.
- `src/services/authService.js`
  - Keeps email-or-username sign-in and only checks that sign-in password is present.
- `src/components/auth/CloudLoginGate.jsx`
  - Keeps the cleaned login/create account UI.

## Important notes

- The Supabase publishable/anon key is browser-safe, but it is not a substitute for Row Level Security.
- Supabase RLS policies must still restrict profile and backup rows to the authenticated user.
- The app does not store passwords.
- Supabase Auth handles password checking.

## Environment variables

For this personal app, the code-owned Supabase config is now the default.

Only use env override for deliberate developer testing:

```env
VITE_SUPABASE_USE_ENV_OVERRIDE=true
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

If `VITE_SUPABASE_USE_ENV_OVERRIDE` is not set, the app uses `src/config/supabaseProjectConfig.js`.

## How to apply

Copy the files in this patch over the same paths in your project.

Then run:

```bash
npm install
npm run build
npm run dev
```

## Manual tests

1. Open the app.
2. Confirm the login page does not show Supabase URL/key fields.
3. Sign in with email + password.
4. If username sign-in fails, try email sign-in first and check that the `profiles` RPC/table setup exists.
5. Confirm the app opens after successful sign-in.
6. Check Settings/Data cloud backup still works.
7. Run `npm run build` before redeploying to Vercel.

## Vercel note

If Vercel has old/wrong Supabase environment variables, this patch ignores them unless `VITE_SUPABASE_USE_ENV_OVERRIDE=true` is set. For the simplest setup, leave that override variable unset.
