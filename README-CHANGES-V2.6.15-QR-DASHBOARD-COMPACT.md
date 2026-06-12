# README Changes - V2.6.15 QR Dashboard Compact Patch

## What Changed

- Changed the Open on phone header button from a phone icon to a QR-code icon.
- Kept an accessible label/title: "Open QR code to open app on phone".
- Preserved the V2.6.14 QR URL fallback behaviour.
- Made dashboard summary cards more compact in Phone view only.
- Income, Spent and Saved can fit in a 3-column compact row where width allows.
- Very narrow phones fall back to a compact 2-column grid.
- The main Money left card remains large and prominent.
- Shortened phone-mode comparison text from "`-100% vs previous month`" to "`-100%`".
- Desktop still shows the full comparison phrase.
- Bumped app, data schema and service-worker cache references to V2.6.15.

## Files Changed

- `README.md`
- `README-CHANGES-V2.6.15-QR-DASHBOARD-COMPACT.md`
- `package.json`
- `package-lock.json`
- `public/service-worker.js`
- `src/components/dashboard/SummaryCard.jsx`
- `src/components/layout/AppShell.jsx`
- `src/pages/DashboardPage.jsx`
- `src/services/storageService.js`
- `src/styles/global.css`

## How To Test

1. Run `npm run build`.
2. Open the app and confirm the Open on phone button shows a QR icon.
3. Open the QR modal and confirm the QR/link/copy behaviour still works.
4. Switch to Phone view.
5. Confirm Income, Spent, Saved and other small summary cards are shorter and use a compact grid.
6. Confirm the Money left card remains large.
7. Confirm phone summary comparison text shows only the percentage.
8. Confirm desktop still shows "`vs previous month`".

## Manual Vercel Check

Keep Production `VITE_PUBLIC_APP_URL` set to:

```text
VITE_PUBLIC_APP_URL=https://guinness-budgeting.vercel.app
```
