# Guinness & Holley Budgeting V2.2.12 Stability and Usability Patch

Date: 2026-05-22

## Summary

This patch keeps the existing app and saved-data format intact while improving archive handling, budget usability, savings-goal editing, and migration safety for older localStorage/backup data.

## Files changed

- `src/pages/BudgetsPage.jsx`
- `src/components/budgets/BudgetCard.jsx`
- `src/pages/SavingsPage.jsx`
- `src/components/savings/SavingsGoalCard.jsx`
- `src/components/transactions/TransactionModal.jsx`
- `src/services/storageService.js`
- `src/styles/global.css`
- `README-CHANGES-V2.2.12.md`

## What changed

### Categories and budgets

- Budget/category cards use a one-open-at-a-time accordion pattern.
- Opening one budget/category card closes the previously opened card.
- Expanded budget cards show linked spending in an internal scroll area with a sensible max height.
- Transactions inside a budget card can be edited directly with the existing transaction modal.
- Category archive controls live in the category edit modal/manager flow rather than as repeated buttons on every card.
- Archived categories are hidden from active category/budget lists.
- Existing transactions that reference archived categories still display the archived category name where the transaction is shown.
- Archived categories appear in an Archived section and can be permanently deleted with confirmation.
- Permanent category delete moves linked transactions to a fallback category where possible and removes linked budget/import-rule records.

### Savings goals

- Savings goals can be added and edited.
- Savings goals can be archived and restored.
- Archived savings goals are hidden from active goal lists.
- Existing linked transfer history remains visible and safe.
- Archived savings goals appear in an Archived section and can be permanently deleted with confirmation.
- Permanent savings-goal delete keeps linked transfers in Transactions and clears only the deleted goal link.

### Stability and migration

- Older savings goals now get safe defaults during data normalization, including archive flags and numeric amounts.
- Older loan/mortgage records now get safe defaults during data normalization so missing detail objects are less likely to crash loan views.
- Editing an old transaction linked to an archived category or archived savings goal now shows the archived item as the current selected value instead of hiding it from the form.
- No data model rename or destructive migration is required.

## How to test

1. Run `npm.cmd install` if `node_modules` is missing.
2. Run `npm.cmd run build`.
3. Run `npm.cmd run dev`.
4. Open Dashboard and confirm the app loads.
5. Go to Budgets, open one budget card, then open another. Confirm only one remains open.
6. In an expanded budget card, confirm the transaction list scrolls internally and the Edit button opens the normal transaction modal.
7. Edit a category from Budgets, archive it, and confirm it moves out of active lists into Archived categories.
8. Confirm old transactions using the archived category still display a category name.
9. Permanently delete an archived category and confirm the app asks for confirmation.
10. Go to Savings, add a goal, edit it, archive it, restore it, then archive and permanently delete it with confirmation.
11. Create or edit a transfer linked to a savings goal, then archive that goal and confirm the transfer/history does not crash.
12. Open Loans, add/edit a mortgage, and confirm the detail panel renders without crashing when optional details are blank.
13. Export a JSON backup, restore it through Settings, and confirm counts/preview still work.

## Storage and migration notes

- Existing localStorage/IndexedDB data remains compatible.
- Existing backup JSON remains compatible.
- New normalization only fills missing defaults for savings goals and loans.
- Archived categories/goals are preserved as records unless the user explicitly confirms permanent deletion.

## Remaining risks

- There is still no automated test suite in `package.json`.
- Mortgage/student-loan assumptions should be checked against real statements because rates and thresholds change.
- Permanent delete actions are intentionally available, but users should export a backup first.
