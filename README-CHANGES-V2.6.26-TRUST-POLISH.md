# V2.6.26 Trust And Day-To-Day Polish

This update adds safer diagnostics and several lightweight foundations for everyday use without changing the local-first storage model or wiping existing data.

## What Changed

- Added `Settings -> App health check` with login, Supabase, cloud backup, local backup, example data, unbacked changes, PWA, version and storage-health checks.
- Added clickable dashboard breakdowns for Budget Left, Income, Spent, Saved, Available Balance, Excluded Spending and Carry-forward.
- Added a local recent activity log for important app changes.
- Added a backup risk/status card with backup age, unbacked change count and JSON export action.
- Added a guided month close assistant that writes a single closed-month record for the selected month.
- Added house agreement notes, contribution-balance estimates and a fixed-rate mortgage overpayment estimator.
- Added budget templates, a Budgets-page safe daily flexible spend figure and pace-aware budget warning data.
- Added a basic planned transactions list in Settings. Planned items are stored separately and are not counted as real transactions.
- Added shared feature suggestion listing and thumbs up/down voting through Supabase RPCs.
- Added a lightweight global search panel and quick action menu in the header.
- Added backup and pace-aware budget notifications to the notification centre.
- Added `Settings -> About / changelog` for app version, data version and recent changes.

## Data Structures Added

The local backup payload now includes:

- `activityLog`
- `budgetTemplates`
- `plannedTransactions`
- house `agreementNotes`

These are optional arrays/fields, so older saved data remains compatible.

## Supabase Setup

Run the latest SQL from `Settings -> Cloud backup -> Show Supabase SQL setup`, or run:

```text
supabase-admin-control-centre.sql
```

The SQL is safe to rerun and adds/updates:

- admin access RPCs and audit RPCs
- feature suggestion listing/voting RPCs
- `public.gh_feature_suggestion_votes`
- the `in_progress` suggestion status constraint

After running SQL in Supabase, wait 30-60 seconds for the schema cache, then refresh the app.

## Testing Notes

- Open Settings and confirm App health check, Backup risk, Activity log, Month close assistant, Budget templates, Planned transactions and About/changelog render.
- Click major Dashboard cards and confirm the breakdown modal explains the values.
- Create a budget template from the current month, then apply it to a different month after confirming the overwrite prompt.
- Add a planned transaction and confirm it appears in Settings without changing real dashboard totals.
- In House, save agreement notes and test the contribution balance and mortgage overpayment estimate.
- Submit/vote on a feature suggestion after running the updated SQL.
- Open the search and quick action buttons in the header on desktop and mobile widths.

## Known Limitations

- CSV import review and import-rule training were left as safe foundations/documentation in this pass; existing CSV import was preserved.
- Planned transactions are not yet matched automatically during CSV import.
- Activity undo is not implemented because safe undo needs action-specific reversal rules.
- Mortgage overpayment calculations are estimates only and assume fixed interest.

## Rollback Advice

Before testing this update against real data, export a JSON backup from Settings. Supabase SQL changes do not delete user data, but keeping a local JSON backup remains the safest rollback path.
