# V2.6.23 House Tracking V1

V2.6.23 adds a local-first House area inside Loans. It keeps existing student loans and mortgage loan records, and maps mortgage loans into House records where possible without deleting the original loan data.

## What Changed

- Added House summary cards for value, mortgage balance, estimated equity and contributions.
- Added House details for property value, purchase details, notes, ownership mode and mortgage details.
- Added House contributions with deposit, mortgage payment, overpayment, legal fees, stamp duty, renovation, repair, furniture/appliance, insurance, service charge and other types.
- Added contribution source types: external contribution, linked transaction and manual adjustment.
- Added People / Splits tracking with optional manual ownership percentages.
- Added a Shared users section as a safe disabled foundation. Live Supabase sharing still needs dedicated tables/RLS before invites can work securely.
- Added linked-house fields to transactions and CSV export.
- Added House summary to the monthly HTML report.
- Included house data in normal JSON/cloud backup payloads through the local app data model.

## Data Model

New local data arrays:

- `houses`
- `housePeople`
- `houseContributions`
- `houseMembers`
- `houseInvites`
- `houseOwnershipSplits`

Existing mortgage records remain in `loans`. The app creates compatibility House records from mortgage loans using stable IDs like `house_from_<loanId>` when no linked house exists.

## Contribution Rules

- External contributions do not change tracked account balances.
- Linked transaction contributions point at one transaction and should not be duplicated.
- Editing or deleting a linked House contribution does not delete the transaction.
- Deleting a linked transaction removes the linked House contribution.

## Ownership Note

Contribution percentages are tracking estimates only, not legal ownership. Manual ownership split is separate and should total 100% when used.

## Sharing Status

Secure shared-house access is not enabled yet. The UI and local data model are ready for a future Supabase-backed version, but V2.6.23 does not expose houses to other accounts. Do not treat local House members/invites as access control.

Future Supabase sharing must include RLS so shared users only see house-related summaries and cannot see unrelated accounts, balances, transactions, budgets, reports, backups or settings.

## Testing

- Open Loans and confirm House appears above the existing loan tracker.
- Confirm old mortgage loans appear as House records where possible.
- Confirm student loans still work.
- Add a House and edit property/mortgage details.
- Add people and manual ownership percentages.
- Add an external deposit and confirm account balances do not change.
- Link a transaction to a House and confirm exactly one House contribution appears.
- Edit/delete a linked contribution and confirm the original transaction is not deleted.
- Archive and restore a House.
- Export JSON backup and confirm house arrays are present.
- Export transaction CSV and confirm linked-house columns are present.
- Generate a monthly report and confirm the House summary appears.
- Run `npm run build`.
