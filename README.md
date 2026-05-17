# Guinness Budgeting

Local React budgeting app for personal, student and household budgeting.

## Current version

V1.11.0 — installable PWA/app icon patch.

## What is included

- React/Vite app structure
- Top navigation
- Dashboard
- Example data
- localStorage save/load
- Add/edit/delete transactions
- Expense / income / transfer transaction types
- Category budgets with expandable progress cards
- Savings goal cards
- Accounts page with calculated balances
- Bills page structure
- Reports page
- CSV export
- Full JSON backup export
- JSON backup import/restore with preview and validation
- Backup status in Settings
- Data/app version metadata in saved data and backup files
- Print/PDF report export
- Hidden reset with `DELETE` confirmation
- Progressive Web App manifest
- Service worker for production/offline app shell
- GB app icon, favicon and mobile icons
- Install app panel in Settings
- Responsive layout

## Install and run for development

1. Install Node.js if needed.
2. Open this folder in VS Code.
3. In the terminal, run:

```bash
npm install
npm.cmd run dev
```

4. Open the local Vite URL shown in the terminal, usually:

```bash
http://localhost:5173
```

## Test the installable app/PWA behaviour

The service worker is only registered in the production build. This avoids development-cache problems while coding.

Run:

```bash
npm run build
npm run preview
```

Then open the preview URL shown in the terminal. In Chrome/Edge, the browser may show an install icon in the address bar. You can also check:

```text
Settings -> Install app
```

If the install button is not available, use the browser menu:

```text
Install app / Apps / Add to Home Screen
```

Exact wording depends on the browser and device.

## Backup and restore

Go to:

```text
Settings -> Data backup and restore
```

Use **Export full backup** to download a full `.json` backup file. Save this somewhere safe, such as OneDrive.

Use **Import / restore backup** to choose a previous backup file. The app previews the contents before restoring. Restoring replaces all current local app data in that browser.

## Storage note

This version still uses `localStorage` through `src/services/storageService.js`. The PWA install feature does not add cloud sync. Data is still local to the browser/app install unless you export and restore a backup manually.

Future storage options remain:

- IndexedDB for stronger local browser storage
- cloud database/login for access from phone/web/different computers
- desktop wrapper later if needed
