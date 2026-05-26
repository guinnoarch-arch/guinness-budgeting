# Guinness & Holley Budgeting V2.3 Data Safety and Storage Polish

Date: 2026-05-22

## Summary

This patch improves the data-safety and storage visibility around the existing local browser storage, backup reminder, migration, and restore flows. It does not remove existing features and does not require a destructive data migration.

## Files changed

- `src/services/storageService.js`
- `src/pages/SettingsPage.jsx`
- `README-CHANGES-V2.3.md`

Related files already used by this flow:

- `src/components/layout/AppShell.jsx`
- `src/styles/global.css`
- `src/services/indexedDbStorageService.js`
- `src/services/receiptStorageService.js`

## What changed

### Storage health/status

- Settings now shows whether `localStorage` is available.
- Settings shows approximate app data size and the current localStorage recovery-copy size.
- Settings shows app version, data version, last backup date, unbacked-change status, and browser storage quota when available.
- Settings shows the latest migration run, previous/new data versions, and migration warnings/errors.
- A current localStorage recovery copy is kept after successful saves so the older localStorage restore path remains useful.

### Migration logs

- Data upgrades now write structured storage/migration log entries.
- Migration logs include previous version, new version, migration date/time, actions taken, and warnings.
- Legacy localStorage-to-current-storage migration logs include success/failure details.
- Migration failures are caught and logged so they do not blank-crash the app.
- Settings displays migration log version/action/warning details.

### Backup reminder polish

- Normal app-data changes continue to mark backup as needed.
- Backup reminder sensitivity remains strict by default.
- Backup banners remain below the navigation tabs.
- Backup banners keep the existing `Not now` dismissal without clearing backup-needed status.
- The header `Backup Now` button continues to use urgency classes for normal/recommended/urgent states.
- Flashing remains controlled by the Settings appearance option.

### Restore backup preview and validation

- JSON restore still requires a preview before replacing current data.
- Preview includes file name, backup date, data version, counts, and warnings.
- Restore requires typing `RESTORE`.
- V2.3 restore remains replace-only; merge restore is not implemented.
- Invalid and non-JSON backup files are blocked before restore.
- Files over 25 MB are blocked before parsing to avoid browser freezes.
- Before JSON or cloud restore replacement, the app now tries to create an emergency browser snapshot of the current data.

### Compatibility

Backup/export/restore remains compatible with:

- archived categories
- archived savings goals
- edited savings goals
- budget transactions
- loans and mortgage data
- import rules
- external account mappings
- app settings
- closed months

## Storage and migration notes

- Existing localStorage/IndexedDB data remains compatible.
- Existing JSON backups remain compatible.
- No user-facing data fields were removed.
- If a stored record has an older data version, the app normalises it and logs the upgrade.
- Emergency pre-restore snapshots are browser-local recovery records, not downloaded files. Export a JSON backup before major restore/reset work.

## How to test

1. Run `npm.cmd install` if `node_modules` is missing.
2. Run `npm.cmd run build`.
3. Run `npm.cmd run dev`.
4. Open `http://localhost:5173/`.
5. Go to Settings -> Storage health.
6. Confirm localStorage availability, app version, data version, last backup, unbacked changes, and migration fields are shown.
7. Make a harmless change, such as changing a setting, and confirm backup is marked as needed.
8. Confirm the backup banner appears below the top tabs.
9. Click `Not now` and confirm the banner dismisses without clearing the unbacked-change count/status.
10. Confirm the `Backup Now` button changes urgency styling when changes are unbacked or backups are old.
11. Export a full backup.
12. Import that backup and confirm the restore preview shows file name, exported date, data version, transactions, accounts, categories, budgets, recurring items, and savings goals.
13. Confirm restore is blocked until `RESTORE` is typed.
14. Try selecting a non-JSON file and confirm restore is rejected with a useful error.
15. Restore a valid backup and confirm the app loads afterward.
16. Check Settings -> Storage and migration logs for restore/migration/snapshot entries.
17. Check archived categories/goals, budgets, loans, import rules, account mappings, settings, and closed months still appear after export/restore.

## Remaining risks

- There is still no automated test suite or lint script in `package.json`.
- Browser storage can still be cleared by the browser or profile cleanup tools. JSON backups remain essential.
- Restore merge is intentionally not implemented in V2.3.
