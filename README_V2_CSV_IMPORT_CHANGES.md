# Guinness Budgeting V2.0 CSV Import Patch

This patch upgrades V1.14 to V2.0 by adding the first working bank CSV import system.

## What changed

### Main new feature
- Added a new **Import** page in the top navigation.
- Users can upload a bank CSV for a selected Guinness Budgeting account.
- The app auto-detects likely CSV columns, but lets the user manually map:
  - Date
  - Description
  - Signed amount
  - Paid in
  - Paid out
  - Balance / closing balance
- The app creates a preview before saving anything.

### CSV import intelligence
- Detects normal income and expense rows.
- Suggests categories from simple keywords and saved import rules.
- Imports savings account interest as income when recognised.
- Adds a new default income category: **Savings Interest**.

### Planned/manual transaction matching
- CSV rows can match existing planned/manual transactions instead of creating duplicates.
- Useful for wages, rent, bills, subscriptions and other planned payments.
- Matched transactions are marked as matched/imported and keep planned date/amount history fields.

### Transfer handling
- CSV rows that look like transfers are shown as transfer rows.
- User chooses the other Guinness Budgeting account.
- The app stores transfer rules so similar rows can be recognised faster next time.
- When the second account CSV is imported later, the app can link the opposite transfer row to the existing transfer rather than creating a duplicate.

### External account mapping
- Added storage for external account names found in CSV text.
- Example: `MONZO CURRENT` can be remembered as corresponding to a Guinness Budgeting account.
- This supports faster future transfer matching.

### Duplicate detection
- Imported bank rows store source row hashes in `matchedBankRows`.
- Re-imported rows are unticked by default as duplicates.
- Existing similar transactions are also checked before creating new rows.

### Balance reconciliation
- If the CSV includes a balance column, the app checks the CSV closing/latest balance.
- If the CSV is current, it compares against the current account balance after import.
- If the CSV is older, it compares against the Guinness Budgeting account balance at the CSV latest transaction date.
- If still different after import, the user can create a dated reconciliation adjustment instead of silently overwriting the balance.

### Import history
- Adds recent import batch history.
- Tracks new rows, linked rows, skipped rows and reconciliation status.

## Files changed

### New files
- `src/pages/ImportPage.jsx`
- `src/services/csvImportService.js`
- `README_V2_CSV_IMPORT_CHANGES.md`

### Modified files
- `src/main.jsx`
- `src/components/layout/TopNav.jsx`
- `src/data/defaultCategories.js`
- `src/pages/SettingsPage.jsx`
- `src/services/storageService.js`
- `src/utils/calculations.js`
- `src/styles/global.css`
- `package.json`
- `package-lock.json`

## New data fields

The app now normalises these extra arrays into saved data:

- `importBatches`
- `importRules`
- `transferRules`
- `externalAccountMappings`

Transactions may now also contain:

- `status`
- `importSource`
- `matchedBankRows`
- `plannedDate`
- `plannedAmount`
- `actualDate`
- `actualAmount`

## How to apply

1. Back up your current project folder first.
2. Copy the files from this patch into the same locations in your Guinness Budgeting project.
3. Let the new files overwrite the old files when asked.
4. Run:

```bash
npm install
npm run dev
```

5. Open the app and check the top navigation has a new **Import** tab.

## How to test

### Basic CSV import test
Create a small test CSV like this:

```csv
Date,Description,Amount,Balance
2026-05-01,ACME PAYROLL,1200,1200
2026-05-02,TRANSFER TO SAVINGS,-200,1000
2026-05-03,TESCO,-25.50,974.50
```

Then:

1. Go to **Import**.
2. Select **Current Account**.
3. Upload the CSV.
4. Check the column mapping.
5. Press **Analyse import**.
6. Set the transfer row's other account to **Savings Account**.
7. Confirm the import.
8. Check Transactions and Accounts.

### Transfer duplicate test
1. Import a Current Account CSV with `TRANSFER TO SAVINGS` for `-200`.
2. Import a Savings Account CSV with `TRANSFER FROM CURRENT` for `+200`.
3. The second row should be suggested as a link to the existing transfer rather than a new separate income row.

### Planned payment matching test
1. Manually create a wage/rent/bill transaction.
2. Import a CSV row with the same or close amount/date.
3. The preview should suggest linking the CSV row to the planned/manual transaction.

### Reconciliation test
1. Upload a CSV with a balance column.
2. Confirm import.
3. If the CSV balance and GB calculated balance differ, the app should offer a dated reconciliation adjustment.

## Known limits in this V2.0 patch

- This is still local browser storage only.
- No bank API/login connection is added.
- CSV parsing supports normal comma-separated CSV files, including quoted cells, but very unusual bank exports may still need manual cleanup.
- Transfer detection is heuristic. The user should review transfer rows before import.
- Category matching is keyword/rule based, not AI-based.
- Undo import batch is not yet added.
- Receipt image storage is still not implemented.
- Dark mode and dashboard layout switching are still later features.

## Build check

The patched app was production-built successfully with Vite. The build produced the normal large-bundle warning only; no compile errors were found.
