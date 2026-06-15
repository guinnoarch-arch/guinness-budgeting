# V2.6.24 House Sharing Supabase Access

V2.6.24 replaces the disabled House sharing placeholder with Supabase-backed shared access.

## What Changed

- Added real House sharing controls in Loans -> House -> Shared users.
- Added a safe House sharing SQL setup file: `supabase-house-sharing.sql`.
- The app's Settings -> Show Supabase SQL setup now includes the House sharing SQL.
- Owners can publish/sync a house snapshot and invite users by email or username.
- Owners can change house roles and remove members.
- Invited users can accept or decline pending house invites.
- Editors can add safe external/manual house contributions through Supabase RPC.
- Viewers can read shared house details but cannot edit or contribute.

## Supabase Setup

Run the SQL from Settings -> Show Supabase SQL setup, or run `supabase-house-sharing.sql` after the main cloud/admin setup.

The migration creates these tables:

- `public.gh_houses`
- `public.gh_house_people`
- `public.gh_house_contributions`
- `public.gh_house_ownership_splits`
- `public.gh_house_members`
- `public.gh_house_invites`

The frontend does not use service-role keys. Direct table access is revoked from `anon` and `authenticated`; access goes through security-definer RPC functions that check `auth.uid()`.

## RPC Functions

- `public.gh_house_list_accessible()`
- `public.gh_house_upsert_snapshot(...)`
- `public.gh_invite_house_member(...)`
- `public.gh_accept_house_invite(...)`
- `public.gh_decline_house_invite(...)`
- `public.gh_cancel_house_invite(...)`
- `public.gh_update_house_member_role(...)`
- `public.gh_remove_house_member(...)`
- `public.gh_house_add_contribution(...)`

## Roles

- `owner`: can publish/sync the house, invite users, change roles and remove members.
- `editor`: can view and add safe house contributions.
- `viewer`: can view house details only.

The last owner cannot be removed or downgraded by the database functions.

## Privacy Boundary

Shared users receive only house-scoped data: house details, people, splits, safe contributions, member summaries and invite summaries. The sharing RPCs do not return private transactions, balances, accounts, budgets, backups, settings or savings goals.

## Testing

- Run the updated SQL in Supabase SQL Editor and wait 30-60 seconds for the schema cache.
- Sign in, open Loans, add/open a House and press Enable sharing.
- Invite another account by email or username.
- Confirm the invited account can see the pending invite, accept it and then view the shared house.
- Confirm viewers cannot add contributions.
- Confirm editors can add an external/manual contribution.
- Confirm only owners can change roles, remove members or cancel pending invites.
- Confirm direct table reads are not required by the frontend.
- Run `npm run build`.
