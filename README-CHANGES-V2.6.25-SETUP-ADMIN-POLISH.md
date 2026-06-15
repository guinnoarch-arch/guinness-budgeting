# V2.6.25 Setup, Example Data and Admin Suggestions Polish

## What Changed

- Clean setup now starts with default accounts at GBP 0 opening balance.
- Example/demo account balances are only added when the user chooses Explore example app.
- Example budgets and closed-month carry-forward records are now explicitly tagged as example data.
- Remove example data now removes tagged demo records and known older untagged seed records.
- Example cleanup covers transactions, budgets, recurring items, savings goals, closed months, loans, generated example houses and house-related demo rows.
- Header Logout was removed from the main header. Logout remains in Settings -> Profile.
- Header Backup Now is hidden unless backup urgency is red/danger.
- Feature suggestions submitted from Settings can sync into Admin Control Centre through Supabase RPC.
- Admin Control Centre now has a Feature suggestions section with status filtering, status updates and simple admin notes.

## Clean Setup

New users still get default categories and default account rows, but all money values start at GBP 0 unless the user enters real data. No hidden demo transactions, budgets, carry-forward records or example mortgage/house records are kept when Setup is chosen.

## Example Data

Example data uses `isExample: true` and `source: "example"` where possible. The cleanup also recognises the known old seed IDs such as `bud_rent`, `goal_holiday`, `loan_example_mortgage` and `house_from_loan_example_mortgage`.

## Carried Forward

Carried-forward money still comes only from `closedMonths`. Clean setup and example cleanup remove example closed months, so the dashboard does not invent carry-forward money.

## Supabase Suggestions Setup

Run the updated Settings -> Show Supabase SQL setup, or run `supabase-feature-suggestions.sql` after the admin SQL setup. It creates:

- `public.gh_feature_suggestions`
- `public.gh_submit_feature_suggestion(...)`
- `public.gh_admin_list_feature_suggestions(...)`
- `public.gh_admin_update_feature_suggestion(...)`

Normal users can submit suggestions while signed in. Admins can view and manage all suggestions through RPCs that check `public.profiles.role = 'admin'`. No private financial data is returned.

## Testing

- Start setup and choose Setup: dashboard values should be GBP 0.
- Choose Explore example app: demo money and example mortgage/house should appear.
- Settings -> Example data -> Remove example data should remove demo money, demo budgets, example closed months and example loan/house data.
- Settings -> Profile should contain Logout.
- Header Backup Now should appear only when backup urgency is danger/red.
- Submit a suggestion from Settings -> Future features while signed in.
- Open Admin Control Centre -> Feature suggestions and confirm admins can update status/note.
- Run `npm run build`.
