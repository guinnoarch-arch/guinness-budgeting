# CODEX_PROJECT_BRIEF.md

# GH Budgeting / Guinness & Holley Budgeting — Codex Project Brief

## 1. What this project is

This repo is for a personal finance web app called **Guinness & Holley Budgeting**.

Earlier names may appear in the code, including:

- Guinness Budgeting
- GH Budgeting
- Guinness & Holley Budgeting

The app is currently for **personal use**, with possible later use for student budgeting, household budgeting, shared-house bills, savings tracking, and cloud access. The project must stay on a **£0 budget** unless the user explicitly approves paid services.

The user is building the app as a learning/personal project. Prioritise practical reliability, readable code, and safe data handling over enterprise complexity.

---

## 2. Current development aim

The immediate aim is:

1. Review the current repo.
2. Make the app run more smoothly.
3. Improve security and data safety.
4. Preserve existing functionality.
5. Avoid large rewrites unless absolutely necessary.
6. Add clear notes explaining what changed.
7. Keep the app suitable for free hosting/deployment, especially Vercel + free-tier services.

The user wants Codex to inspect the existing app, identify bugs or weak areas, and make careful improvements.

---

## 3. Critical working rules for Codex

### Do not do this

- Do not rewrite the whole app from scratch.
- Do not remove existing features unless they are broken and clearly replaced.
- Do not change the data model without adding a migration or compatibility layer.
- Do not silently break old localStorage/backup data.
- Do not hard-code API keys, Supabase keys, secrets, tokens, service-role keys, or private URLs.
- Do not add paid services.
- Do not add heavy dependencies unless necessary.
- Do not make security theatre. Make practical improvements that actually reduce risk.
- Do not expose user financial data before login if auth/cloud mode is enabled.

### Do this

- First inspect the repo structure and identify the tech stack.
- Read existing README/change logs/version notes before editing.
- Run install/build/test commands if available.
- Make small, controlled patches.
- Preserve current UI style unless fixing layout problems.
- Keep code readable and commented where helpful.
- Add/update a README changes file for every patch.
- Keep backwards compatibility with existing saved data where possible.
- Prefer simple fixes that the user can understand and maintain.

---

## 4. Expected tech stack

The repo is expected to be a React-style web app, likely using:

- React
- Vite or similar build tooling
- JavaScript/JSX
- localStorage for local-first data
- Supabase for optional login/cloud access
- Vercel for deployment
- CSS modules/global CSS/component CSS

Do not assume exact details. Inspect `package.json`, `src/`, `.env.example`, README files, and config files before editing.

---

## 5. App navigation and major pages

Expected top navigation order:

1. Dashboard
2. Transactions
3. Budgets
4. Bills
5. Savings
6. Accounts
7. Reports
8. Settings

There should also be a separate `+ Add Transaction` button, usually top-right, not as a normal nav tab.

---

## 6. Core feature requirements

### Dashboard

The dashboard should prioritise:

- A large **Money Left** card.
- Smaller cards for:
  - monthly income
  - spending
  - saved
  - account/cash balance
  - carry-forward
  - excluded spending where relevant
- Month selector, e.g. May 2026 with previous/next controls.
- Charts:
  - spending vs previous month
  - multi-month trend concept
  - pie chart showing where the monthly budget/money has gone
- Upcoming bills.
- Recent transactions, usually 5.
- Top 3 budget warnings with a “view all” option.

Important money logic:

- The main **budget-left** calculation should be based on active monthly budgets minus spending in those budgeted categories.
- Budget-left must be capped by available spendable account money so it never shows more than the user can actually afford.
- Income should not directly increase budget-left except indirectly through account balances.
- Savings transfers reduce spendable money but should not be treated as ordinary spending.
- Carry-forward from last month should be shown separately and included in the money-left calculation.
- If money left is negative, the main card should clearly show overspent status.

### Transactions

Transaction type dropdown:

- Income
- Expense
- Transfer

Transaction fields expected:

- date
- amount
- type
- title/note
- category
- account
- recurring yes/no
- optional notes
- optional receipt image placeholder / disabled coming-soon field
- exclude from monthly budget flag

Table columns expected:

- Date
- Type
- Title
- Category
- Account
- Amount
- Recurring?
- Actions
- Notes preview
- Receipt icon greyed/coming soon

Filters expected:

- month
- category
- type
- search by title/note

Editing should open a modal/pop-up. Deleting should require confirmation every time.

Large expenses:

- Transactions above a configurable threshold, default around £200, should highlight the “Exclude from monthly budget” option.
- CSV import should flag large expenses and suggest excluding them from monthly budgets.
- Excluded transactions still exist in transactions, account balances, and reports, but do not count against monthly budget warnings or main monthly budget-left.

### Budgets

V1/V2 budget method:

- Monthly budget and category budgets.
- Savings-first method later.

Budget categories:

- Essentials:
  - Rent
  - Bills
  - Food
  - Fuel
  - Car
- Lifestyle:
  - Subscriptions
  - Shopping
  - Going Out
- Finance:
  - Savings
  - Debt
- Education:
  - University
- Other:
  - Other
  - Everything Else

Budget warning thresholds:

- green: 0–75% used
- orange: 75–100% used
- red: over 100%

Budget/category cards:

- show category name directly on progress card/bar
- show amount left
- click expands to details/edit/view transactions
- only one budget should be expanded at a time
- budget transaction list should open to a sensible fixed height and scroll internally
- user should be able to edit a transaction directly from inside the budget view
- archive option should be inside the edit area, not as lots of separate buttons

Categories with no budget should still track spending but show no warning.

Archived categories:

- should be hidden from normal active lists
- should appear in an Archived section
- should be restorable or permanently deleted
- permanent delete must require confirmation
- archiving must not damage historical transactions

### Bills and recurring payments

Bills page sections:

- Upcoming this week
- Upcoming this month
- Recurring payments
- Paid this month

Recurring payment fields:

- name
- amount
- fixed/variable
- category
- account
- frequency
- next due date
- auto-add/confirm
- reminder enabled

Frequencies:

- weekly
- fortnightly
- monthly
- every 4 weeks
- yearly
- custom

Recurring logic:

- Fixed auto-add bills create missing due transactions when app opens.
- Variable bills should ask for the real paid amount when marked as paid.
- Editing or deleting a recurring item must not change previous months’ already-created transactions.
- Cancelled/deleted recurring items should be archived where appropriate.

### Savings

Savings are treated as transfers from current/cash account to savings account, not as normal spending.

Savings goals:

- multiple goals
- progress bars/cards
- show goal name and amount remaining
- click to expand details/edit/contributions
- link transfers to savings goals where possible
- progress updates from manual updates and linked transfers
- allow editing savings goals
- archive savings goals
- archived savings goals can be permanently deleted with confirmation

### Accounts

Default accounts:

- Current Account
- Savings Account
- Cash

Expected features:

- account balances
- calculated balance
- manual reconciliation / adjustment
- recent activity per account
- transfers between accounts
- all-accounts view should show:
  - combined total balance
  - spendable current/cash total
  - savings total
  - breakdown by account type

Transfer form fields:

- from account
- to account
- amount
- date
- note
- optional linked savings goal

### Reports

V1 reports are monthly only.

Monthly report should include:

- summary cards
- charts
- category table
- budget warnings
- savings goals
- upcoming bills
- transaction list

Exports:

- PDF monthly report
- CSV export for all transactions
- JSON backup export for safety

PDF filename format:

`Guinness-Budgeting-May-2026-Report.pdf`

### Settings

Expected Settings sections:

- profile/app name
- currency and month settings
- categories
- accounts
- data export
- danger zone
- future features
- import rules
- backup/storage status
- low-balance/budget-affordability reminders
- large-expense threshold
- optional flashing backup warning preference

Reset/delete all data:

- hidden in danger zone/profile-style area
- requires typing confirmation phrase: `DELETE`

---

## 7. Storage, backup, and migration requirements

The app is local-first unless cloud/auth mode is enabled.

Storage path:

- V1 started with localStorage.
- Code should be structured so storage can move to IndexedDB/Supabase/cloud later.
- Existing localStorage data and backup JSON should not be broken without a migration.

Backup requirements:

- JSON backup export exists or should be preserved.
- Restore backup exists or should be improved, not duplicated unnecessarily.
- Restore should include:
  - preview
  - validation
  - safe replace-current-data initially
  - migration handling where needed
- Storage health/status display should exist or be added.
- Migration logs should exist or be improved.
- App should warn/remind after any data/settings change that a backup is needed.
- Backup warning sensitivity should be strict by default.
- Backup banners should sit below the top navigation tabs, not above them.
- Backup banner should have “Not now” / dismiss option.
- Header Backup Now button should visibly show urgency:
  - green/normal
  - orange/recommended
  - red/required/highly recommended
- Optional flashing on high urgency can exist but must be configurable.

Browser limitations:

- Do not rely on custom backup/download prompts during browser close.
- Before-close warning can only be used where browser limitations allow.

---

## 8. CSV import and reconciliation requirements

CSV import is a V2/V3-level feature and should avoid making users manually enter every small transaction.

Expected CSV import behaviour:

- Import bank statement rows.
- Remember external statement/account names and map them to internal GH account IDs.
- Support saved import rules/mappings in Settings.
- Allow users to view/edit/delete saved mappings.
- Match imported CSV rows against existing manually planned transactions such as:
  - wages
  - rent
  - bills
  - subscriptions
  - savings transfers
  - other large expected payments
- Matching should prevent duplicates by linking CSV row to existing planned/manual transaction.
- Matched planned transactions should update to confirmed/imported status while preserving planning history where useful.
- Support closing/latest balance checks when available.
- If CSV is up to date and no newer app transactions exist, offer to reconcile/update account balance.
- If CSV balance does not match calculated balance, show reconciliation warning rather than silently changing data.
- If CSV is historical, compare balance at the CSV latest transaction date.
- Historical mismatch should prompt user to create a dated reconciliation adjustment at that CSV latest date.
- Interest rows from savings accounts should be imported as Interest income / Savings Interest, not estimated automatically.

Transfer import enhancement:

- CSV import transfer review should allow creating a new internal GH account directly from the transfer-account dropdown.
- Dropdown should include “Add new account”.
- New account should immediately be usable for mapping/import rules.

---

## 9. Auth, Supabase, and security requirements

The user has been setting up Supabase/Vercel and wants login before viewing data.

Security priorities:

- No financial data should be visible before login if auth/cloud mode is enabled.
- Do not put Supabase service-role keys in frontend code.
- Only public anon keys should be exposed client-side.
- Use `.env.local` locally and Vercel environment variables in production.
- Add/update `.env.example` with placeholder names only.
- Validate that missing env vars fail gracefully with a helpful message.
- Ensure Vercel deployment does not expose secrets.
- Check for accidental committed `.env`, API keys, tokens, or credentials.
- Add `.gitignore` entries if missing.
- Use Supabase Row Level Security where cloud user data is stored.
- Avoid global shared data access.
- Auth gate should wrap all pages that contain financial data.
- Use cautious error handling: do not dump secrets or full env details into UI or console.

Practical security audit tasks:

- Search repo for:
  - `service_role`
  - `SUPABASE_SERVICE`
  - `api_key`
  - `secret`
  - `password`
  - `.env`
  - hard-coded Supabase URLs/keys
- Check localStorage handling for obvious data leaks.
- Check backup restore for unsafe parsing/crashes.
- Check CSV import for malformed input handling.
- Check XSS risk from user-entered notes/titles/descriptions.
- Avoid rendering user-entered text as raw HTML.
- Check that delete/reset operations require confirmations.
- Check that auth state is loaded before rendering private data.

---

## 10. Current likely pain points to inspect

Codex should inspect the codebase for:

- App crashes when opening certain sections, including mortgage/loan-related areas if present.
- Restore backup duplication or overlap.
- Storage health and migration logs.
- Layout issues where content does not fit inside cards.
- Budget/category expansion behaviour.
- Archived categories and goals.
- Edit savings goals.
- Editing transactions from the budget view.
- Recurring payment editing/deleting without altering historical transactions.
- Auth gating before private data appears.
- Vercel/Supabase environment variable handling.
- Build errors and dependency issues.
- Accessibility basics: clickable buttons, labels, keyboard-safe modals where easy.

---

## 11. Versioning and patch notes

When making a patch:

- Identify current version from app files, package, README, or changelog.
- Do not invent a version if the project already has one.
- If continuing current work, likely next patch may be around `V2.2.12` or later.
- Add a README changes document for every update.

Expected change note file examples:

- `README_CHANGES_V2.2.12.md`
- `CHANGELOG_V2.2.12.md`
- or follow the repo’s existing convention

Each changes doc should include:

1. Version/date.
2. Summary.
3. Files changed.
4. What changed.
5. How to test.
6. Any migration/storage notes.
7. Any known limitations.
8. Rollback notes if relevant.

---

## 12. Testing expectations

Before finishing, run whatever is available:

- `npm install` or dependency check if needed
- `npm run build`
- `npm run lint` if available
- tests if available
- manually inspect likely crash paths

If commands fail, report:

- command run
- exact error summary
- likely cause
- whether code changes were still made

Suggested manual test checklist:

- app loads
- login screen appears before data if auth enabled
- dashboard loads
- add transaction works
- edit/delete transaction works
- budget cards expand correctly, only one at a time
- budget transaction list scrolls
- edit transaction from budget works
- category archive works
- savings goal edit/archive/delete works
- backup export works
- restore preview/validation works
- settings danger zone requires DELETE
- Vercel build works or is expected to work
- no secrets are committed

---

## 13. Suggested first Codex task

Use this prompt first:

```text
Read the entire repo for the GH Budgeting / Guinness & Holley Budgeting app.

Do not rewrite the app. First inspect the structure, package.json, README/change logs, storage/data services, auth/Supabase setup, and main routes/components.

Goal:
Make the app run more smoothly and improve security/data safety while preserving existing features and saved data compatibility.

Main checks:
1. Build/runtime errors.
2. Crashes in dashboard, budgets, bills, loans/mortgage if present, backup/restore, settings.
3. Auth gate: private financial data must not render before login if auth/cloud mode is enabled.
4. Environment variables: no secrets in frontend/repo; add/update .env.example if needed.
5. Supabase safety: no service-role key in client code; graceful missing-env handling.
6. Storage safety: localStorage/backup JSON validation, migration logs, storage health.
7. XSS/data rendering risk from transaction titles/notes/categories.
8. Delete/reset/archive confirmations.
9. Preserve existing data model or add migration compatibility.
10. Add/update README changes document explaining exactly what changed and how to test it.

Work in small patches. Before editing, give me a short audit plan and list the files you expect to touch. After editing, run the build/lint/tests available and summarise the result.
```

---

## 14. Suggested second Codex task after the audit

After Codex has done the first audit/fix pass, use:

```text
Now continue with a focused polish patch.

Implement or fix the following if not already correct:
1. Budget cards: only one expanded at a time.
2. Budget transaction list: fixed internal scroll area.
3. Edit transaction directly from budget detail view.
4. Category archive action should live inside edit/detail controls, not as lots of separate buttons.
5. Savings goals: edit, archive, restore, permanently delete archived goals with confirmation.
6. Archived categories/goals: hidden from active lists, visible in Archived section, permanent delete requires confirmation.
7. Recurring payments: editing/deleting/archiving should not alter previous months’ created transactions.
8. Keep historical reports/transactions intact.
9. Add or update the version README changes document.

Preserve UI style and data compatibility. Run build/tests afterwards.
```

---

## 15. Suggested security-focused Codex task

Use this when you want a focused security pass:

```text
Perform a security and data-safety review of this React/Vercel/Supabase budgeting app.

Scope:
- frontend auth gating
- Supabase env variable usage
- accidental secrets in repo
- localStorage and backup/restore safety
- CSV import validation if present
- XSS risks from user-entered transaction/category/account/notes text
- dangerous delete/reset actions
- Vercel deployment assumptions

Rules:
- Do not add paid services.
- Do not introduce backend complexity unless needed.
- Do not expose service-role keys to the client.
- Do not break local-first use.
- Do not remove features.

Make minimal code changes that reduce actual risk, then add a README security changes note with:
- findings
- files changed
- fixes made
- how to test
- remaining risks
```

---

## 16. Overall product direction

The long-term app direction is:

- Local-first personal finance app.
- Optional cloud sync/login later or gradually.
- £0 budget where possible.
- Access anywhere if possible through Vercel/Supabase free tiers.
- More app-like experience over time.
- Possible future modules:
  - stocks/market watch
  - AI budgeting assistant
  - stronger cloud syncing
  - full app/PWA install experience
  - V3 shared access if free and secure enough

Do not jump to V3 features until the current app is stable, safe, and backed up properly.
