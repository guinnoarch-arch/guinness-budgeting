# V2.6.18 Admin Bootstrap

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
- `public.gh_admin_settings.admin_claim_enabled`
- `public.gh_admin_audit_log`
- `public.gh_get_admin_access_state()`
- `public.gh_claim_admin()`
- `public.gh_set_admin_claim_mode(boolean)`
- `public.gh_admin_audit_recent(integer)`

It also revokes direct profile updates from changing `role`; admin role changes go through the RPCs.

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
2. In `Admin access settings`, enable `Allow another user to become admin`.
3. The trusted logged-in non-admin opens `Settings -> Profile`.
4. They press `Become admin`.
5. Supabase makes them admin and automatically turns admin-claim mode off again.

Warning: only enable admin-claim mode while intentionally inviting a trusted user.

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
