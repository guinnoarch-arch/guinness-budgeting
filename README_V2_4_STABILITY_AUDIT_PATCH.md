# V2.4 Stability Audit Patch

Built from the uploaded full project ZIP. The ZIP filename said `V2.2.8`, but the app package version inside was `2.3.8`, so this patch is based on the current V2.3.8 codebase and upgrades it to V2.4.0.

## Main goal

This is a stability and code-quality pass before adding bigger future upgrades. It focuses on avoiding data-loss bugs, reducing crash risk, making older saved data survive newer code, and improving performance-heavy areas.

## Key fixes

### 1. App safety mode

Added a React error boundary around the app.

If a page crashes during rendering, the app now shows a safety screen instead of a blank page. The user can export a raw localStorage backup before reloading.

Files:

- `src/components/layout/ErrorBoundary.jsx`
- `src/main.jsx`
- `src/styles/global.css`

### 2. Storage/data hardening

Improved `normaliseAppData()` so older or partial saved data is less likely to break the app after updates.

Changed:

- app/data schema version updated to `2.4.0`
- backup format updated to `1.6`
- old accounts/categories without `isActive` now remain visible by default
- missing `budgetWarningThresholds` no longer crashes budget warnings
- missing `billReminderDays` gets a safe default
- missing `futureSuggestions` gets an empty list
- invalid account/category records are normalised instead of being allowed to crash later
- duplicate `currency` setting line removed

Files:

- `src/services/storageService.js`
- `package.json`
- `package-lock.json`

### 3. Date handling fixes

Replaced risky UTC-based date formatting with local date helpers.

This avoids a common bug where dates can shift back one day around midnight/time zones because of `toISOString().slice(0, 10)`.

Added/updated helpers:

- `formatIsoDateLocal()`
- `parseIsoDateLocal()`
- `addDaysToIsoDate()`
- `addMonthsToIsoDate()`
- `addYearsToIsoDate()`

Files:

- `src/utils/dates.js`
- `src/pages/LoansPage.jsx`
- `src/utils/loanCalculations.js`
- `src/utils/loanLinking.js`
- `src/services/csvImportService.js`

### 4. Recurring payment catch-up fix

The old recurring-payment logic only handled one missed recurring payment cleanly. If the app was not opened for multiple months, some fixed recurring bills could be missed or `nextDueDate` could fail to advance correctly.

Now fixed recurring payments catch up through missed due dates until today, with a safety limit.

Files:

- `src/services/recurringService.js`

### 5. Active/archive compatibility

Several places used checks like `item.isActive`, which hides older records where `isActive` is missing/undefined.

Changed these to use `isActive !== false`, so old records stay active unless explicitly archived/deactivated.

Files:

- `src/components/dashboard/SavingsGoalsPanel.jsx`
- `src/components/dashboard/UpcomingBillsPanel.jsx`
- `src/components/layout/TopNav.jsx`
- `src/components/transactions/TransactionModal.jsx`
- `src/pages/BudgetsPage.jsx`
- `src/pages/DashboardPage.jsx`
- `src/pages/ImportPage.jsx`
- `src/pages/SavingsPage.jsx`
- `src/pages/SettingsPage.jsx`
- `src/utils/calculations.js`

### 6. Accounts balance graph performance

The Accounts page balance graph was recalculating balances by scanning transactions repeatedly for every point/account.

It now builds sorted account deltas once and walks the graph checkpoints more efficiently.

Files:

- `src/pages/AccountsPage.jsx`

### 7. Bills page correctness

Fixed Bills page grouping issues:

- `Upcoming this week` now actually shows bills due in the next 7 days.
- `Upcoming this month` is filtered to the current month.
- `Paid this month` is filtered to the current month.
- Removed duplicated `onEdit` prop in one recurring-card render.

Files:

- `src/pages/BillsPage.jsx`

### 8. Service worker hardening

The service worker install step now uses `Promise.allSettled()` so one missing cached file does not fail the entire service-worker install.

Also updated cache name to V2.4.0.

Files:

- `public/service-worker.js`
- `public/manifest.webmanifest`
- `index.html`

### 9. Bundle optimisation

Added Vite manual chunk splitting for React and Recharts.

Before this patch, build output had one large JS chunk and showed the Vite 500 kB warning. After this patch, the build splits into smaller chunks and the warning is gone.

Files:

- `vite.config.js`

## Checks run

### Smoke tests

Ran a Node smoke test covering:

- old account records without `isActive`
- missing budget warning thresholds
- missing suggestions array
- budget warning calculation safety
- monthly summary calculation safety
- recurring fixed-payment catch-up
- local month-end date handling

Result: passed.

### Production build

Ran:

```bash
npm run build
```

Result: passed.

Build output is now split into:

- `react-vendor`
- `charts`
- main app bundle

The previous >500 kB single-bundle warning is gone.

## Not changed in this patch

This patch does not redesign the UI or add new user-facing finance features. It is mostly a stability/refactor patch so the app is safer before larger upgrades.

## Suggested next cleanup after this

1. Add a proper test framework such as Vitest.
2. Move chart calculation helpers into standalone utility files so they are easier to test.
3. Add import/backup restore tests.
4. Add migration tests using old backup examples.
5. Consider moving large pages such as Reports/Import/Loans into lazy-loaded routes later.
