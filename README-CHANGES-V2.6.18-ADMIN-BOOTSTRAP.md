# V2.6.18/V2.6.19 Admin Bootstrap And User Management

V2.6.19 extends the Admin Control Centre with safe user/account summaries, admin promotion/demotion, account blocking/unblocking and blocked-user route guards.

## Files Changed

- `src/pages/ControlCentrePage.jsx`
- `src/pages/SettingsPage.jsx`
- `src/main.jsx`
- `src/services/adminService.js`
- `src/services/cloudBackupService.js`
- `src/services/storageService.js`
- `src/styles/global.css`
- `README.md`
- `public/service-worker.js`
- `package.json`

## Route and Access

- Admin Control Centre route: `/admin`
- Settings entry: `Settings -> Profile -> Admin Control Centre`
- Admin users see `Open Admin Control Centre`.
- Non-admin users who open `/admin` directly see `Not authorised` and a `Back to Budgeting` button.
- `Back to Budgeting` returns to `Settings -> Profile`.

## Supabase Admin Field

Admin status is stored in:

```sql
public.profiles.role = 'admin'
```

The frontend does not use service-role keys and does not treat email allowlists as admin authority.

## Required Supabase Setup

Run the latest SQL from:

```text
Settings -> Cloud backup -> Show Supabase SQL setup
```

The SQL adds:

- `public.profiles.role`
- `public.profiles.blocked`
- `public.profiles.blocked_at`
- `public.profiles.blocked_by`
- `public.gh_admin_settings.admin_claim_enabled`
- `public.gh_admin_audit_log`
- `public.gh_get_admin_access_state()`
- `public.gh_claim_admin()`
- `public.gh_set_admin_claim_mode(boolean)`
- `public.gh_admin_audit_recent(integer)`
- `public.gh_admin_list_users()`
- `public.gh_admin_set_user_role(uuid, text)`
- `public.gh_admin_set_user_blocked(uuid, boolean)`

It also revokes direct profile updates from changing `role`; admin role changes go through the RPCs.

After running SQL, wait 30-60 seconds and refresh the app if Supabase says a new function was not found. That usually means the PostgREST schema cache has not refreshed yet.

## First Admin Flow

1. Sign in with the only current Supabase account.
2. Open `Settings -> Profile`.
3. If no admin exists, `Become admin` appears.
4. Press `Become admin`.
5. Supabase sets `public.profiles.role = 'admin'`.
6. Supabase turns admin-claim mode off.
7. The app shows: `This account is now admin. Admin claim mode has been turned off.`

Anonymous/logged-out users cannot claim admin.

## Adding Another Admin

1. Existing admin opens `/admin`.
2. Go to `Users / Accounts`.
3. Find the target user.
4. Press `Promote to admin`.
5. Confirm the warning.
6. Supabase updates `public.profiles.role = 'admin'` and logs the action.

Admin claim mode is now a fallback path only. Use `Allow another user to become admin` only while intentionally inviting another trusted user to self-claim admin.

## Blocking And Unblocking Users

Admins can block or unblock a user in `/admin -> Users / Accounts`.

- Blocking sets `public.profiles.blocked = true`.
- Blocking does not delete budget data.
- Blocking does not wipe localStorage or IndexedDB.
- Blocked users see `Your account has been blocked. Contact the app admin.`
- Blocked users cannot open the private budgeting area.
- Updated cloud backup RLS policies stop blocked users from reading, writing, updating or deleting cloud backups.

The app prevents removing or blocking the last admin. Self-block is guarded and should only be possible when another active admin exists.

## Safe User List

`public.gh_admin_list_users()` returns only safe profile/account summary fields:

- username
- email
- role
- blocked status
- created/updated timestamps
- last cloud backup timestamp
- active/inactive status inferred from recent backup activity

It does not return transactions, balances, budgets, bills, savings goals or backup contents.

## Testing

- Login with the only current account.
- Open `Settings -> Profile`.
- Confirm `Become admin` appears if no admin exists.
- Press it and confirm the success message.
- Confirm `Open Admin Control Centre` appears.
- Open `/admin`.
- Confirm `Back to Budgeting` returns to `Settings -> Profile`.
- Confirm admin-claim mode is off after the claim.
- With a non-admin account, open `/admin` and confirm `Not authorised`.
- As admin, temporarily enable admin-claim mode and confirm a trusted non-admin can claim admin.
- As admin, confirm `Users / Accounts` shows usernames but no financial data.
- Promote a test user to admin.
- Demote a test admin back to user.
- Confirm the app blocks demoting the last admin.
- Block a test user.
- Confirm the blocked user sees the blocked-account page and cannot access budgeting routes.
- Unblock the test user and confirm access returns.
- Confirm the audit log records promote, demote, block, unblock and claim-mode actions.
