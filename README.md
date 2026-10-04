# Guinness & Holley Budgeting

A personal budgeting app for one household. It keeps your money data on your
own device, works offline once installed, and can back up to the cloud when
you sign in.

Version 2.6.27 · React 19 · Vite 6

## What it does

- **Dashboard:** this month's money left, income, spending, savings, a
  six-month trend, a budget breakdown, upcoming bills and budget warnings.
- **Transactions:** a full table on a computer; on a phone, one line per
  transaction (name, date, amount) that opens its details. Add, edit and delete income, spending and transfers, with
  receipts, notes, repeat settings and links to loans or a house. Deleting
  offers an Undo.
- **Budgets:** a monthly limit per category, shown as *On track*,
  *Nearly used* or *Over budget* (with the amount left or over), plus
  archived budgets and categories.
- **Bills:** recurring payments and reminders, due this week and this month.
- **Savings:** goals with targets and progress.
- **Accounts:** balances, a balance-over-time chart, reconcile against the
  bank, an account check, archive and delete.
- **Loans:** student loans, mortgages and a house tracker (property value,
  mortgage, contributions, people and splits).
- **Reports:** month summary, category spending against budget, planned
  against actual, export to CSV, JSON or a printable report.
- **Import:** bank statement CSVs, including several files at once. Transfers
  between your own accounts are matched up so they're never counted twice,
  and rows already in the app are flagged as duplicates.
- **Settings:** profile, appearance, backup and restore, cloud backup, import
  and payment rules, month close, budget templates, planned transactions and
  more.

## Running it

You need Node.js 18 or later.

```bash
npm install
npm run dev        # development server, usually http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

The app opens on a sign-in screen. Sign in with your cloud account. If this
device already has a saved budget, you can also open it offline from there.

### Configuration

The Supabase project used for sign-in and cloud backup is set in
`src/config/supabaseProjectConfig.js`. It holds only the public
(publishable/anon) key. Never put a service-role key anywhere in this
repository or in a browser environment variable.

Optional environment variables (see `.env.example`):

| Variable | What it's for |
| --- | --- |
| `VITE_PUBLIC_APP_URL` | The stable public address of the app, used by the "open on your phone" QR code. Set it in Vercel's Production environment, e.g. `https://guinness-budgeting.vercel.app`. |
| `VITE_SUPABASE_USE_ENV_OVERRIDE` | Set to `true` only to point a development copy at a different Supabase project. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The other project's details, used only when the override above is `true`. |

### Deploying

The app is a static site. `vercel.json` and `netlify.toml` send every path
to `index.html` so links such as `/?page=budgets` and `/admin` work on
refresh. The service worker only registers in production builds; after a
deploy, installed copies show an **Update available** banner.

## Where your data lives

- Everything is saved in the browser first (IndexedDB, with localStorage as a
  fallback). The app works without a network connection.
- **Settings → Data backup and restore** exports a full `.json` backup and
  restores one, with a preview of what's in it first. This is the safest copy
  to keep.
- **Settings → Cloud backup** uploads and restores backups once you're signed
  in. It's backup and restore, not live sync: on a new phone, sign in and
  restore the latest cloud backup.
- If saved data can't be read after an update, the app shows a recovery
  screen rather than starting fresh over your data.

## Cloud and admin setup (Supabase)

Run `supabase-admin-control-centre.sql` in the Supabase SQL editor (the same
SQL is shown under **Settings → Cloud backup → Show Supabase SQL setup**).
It creates profiles, cloud backups, the admin role, admin audit log and the
Row Level Security that limits each person to their own rows.
`supabase-house-sharing.sql` and `supabase-feature-suggestions.sql` add house
sharing and the suggestions box.

After running SQL, wait 30–60 seconds for Supabase to refresh, then reload
the app. The admin Control Centre is at `/admin`. While no admin exists, a
signed-in user can claim it from **Settings → Profile → Become admin**.

## Project layout

```text
src/
  App.jsx            app state, loading, sign-in and which page to show
  main.jsx           entry point
  pages/             one file per screen, plus the page list and titles
  components/        pieces of each screen, grouped by area
    common/          shared parts: form errors, async buttons, charts
    layout/          header, navigation, search, banners
  hooks/             reusable behaviour (routing, theme, dialogs, cloud
                     sync, form validation, undo, editors)
  services/          storage, backup, cloud, CSV import, admin
  utils/             money, dates, validation, errors, charts, theme
  config/            Supabase project and default thresholds
  data/              default accounts, categories and example data
  styles/
    tokens.css       every colour, size, radius and shadow (light and dark)
    global.css       the app's styles, built from those tokens
    loans.css        Loans page styles
public/              icons, web app manifest, service worker
```

## Design

- **Palette:** near-black ink on warm cream with one muted gold accent from
  the logo. Green, red and amber are muted and always come with words.
- **Accent colour:** can be changed in Settings → Appearance (Harp gold,
  Bottle green, GH logo green, Claret, Slate blue, Ink or any colour). Text on
  it switches between ink and cream automatically so it stays readable.
- **Formatting:** money is shown as `£1,234.56` (en-GB), lined up in columns
  and right-aligned in tables. Dates read `10 Oct 2026`.
- **Dark mode:** follows the same tokens; change them in `tokens.css`.
- **Phones:** below 720px wide the compact layout switches on by itself, and
  every control is at least 44px.

## Accessibility

- Pop-ups are announced as dialogs. Focus moves into them, stays inside, and
  returns to the button that opened them. Escape closes them
  (`hooks/useDialogManager.js`).
- A "Skip to content" link, labelled navigation, the current page announced,
  and one top-level heading per page.
- Form errors appear next to the field, with an icon and text, and a summary
  links to each one.
- All text meets WCAG AA contrast in light and dark mode.
- The device's "reduce motion" setting stops animations, including charts.

## Testing

There's no automated test runner in the repository yet. Before a release:

1. `npm run build` must pass.
2. Work through [`docs/MANUAL-TEST-CHECKLIST.md`](docs/MANUAL-TEST-CHECKLIST.md)
   on a computer and on a phone.

During the 2026 polish pass the app was also checked with headless-browser
scripts (forms, CSV import, budgets, pop-ups, keyboard use, phone layout),
an axe-core accessibility scan and a contrast scan of every page.

## Security notes

- The browser only ever uses the Supabase publishable/anon key.
- Each person's data is protected by Row Level Security in Supabase.
- The bank-linking feature flag is off by default and doesn't connect to any
  bank.
