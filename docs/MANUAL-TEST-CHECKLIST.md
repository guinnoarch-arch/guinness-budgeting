# Manual test checklist

Run this before a release, once on a computer and once on a phone. Tick each
line. Use a copy of real data, or **Settings → Example data**, never your
only copy. Export a backup first (**Settings → Data backup and restore →
Export full backup**).

Expected results are in *italics*.

## 1. Start-up and navigation

- [ ] Open the app signed out. *Sign-in screen. Enter submits the form. Empty fields show errors under each field.*
- [ ] Sign in. *Dashboard opens; the browser tab reads "Dashboard · Guinness & Holley Budgeting".*
- [ ] Click every tab. *Each page opens and the tab title changes to match.*
- [ ] Use the browser Back and Forward buttons. *You move between the pages you visited.*
- [ ] Refresh on any page. *The same page reopens.*
- [ ] Go to `/?page=nothing` and `/nothing`. *"There's no page at this address" with a way back to the dashboard.*

## 2. Transactions

- [ ] Add an expense, an income and a transfer. *Each appears as one line: name, date as e.g. "3 Oct 2026", and the amount right-aligned.*
- [ ] Click (or tab to and press Enter on) a transaction. *A pop-up shows all its details with Edit and Delete. Escape closes it.*
- [ ] Try to save with no amount, or with 12.345. *A clear message under the amount. What you typed is kept.*
- [ ] Try a transfer from an account to itself. *An error by the "To" account.*
- [ ] Open a transaction, press **Edit**, change it and save. *The change shows straight away.*
- [ ] Open a transaction, press **Delete**, then press **Undo** within 10 seconds. *It comes back exactly as it was.*
- [ ] Attach a receipt, view it, then remove it.

## 3. Budgets

- [ ] Set a budget for a category. *The card shows "£X left" and "On track".*
- [ ] Spend past 75% of it. *"Nearly used", amber.*
- [ ] Spend past 100%. *"Over budget", red, and the card reads "£X over" (never "-£X left").*
- [ ] Rename a category, archive it, restore it. *It moves to and from "Archived categories".*
- [ ] Open **Manage categories & budgets** and add a category.

## 4. CSV import (most important)

- [ ] Import a CSV from one bank. *Columns are guessed; dates read as UK dates.*
- [ ] Import a file with a bad row (e.g. 31/02/2026 or an empty amount). *The preview lists it by spreadsheet row number with the reason, and the summary says how many rows were left out.*
- [ ] Import statements from two of your accounts that include a transfer between them. *The transfer is matched across the two files, shown linked, and counted once.*
- [ ] Import the same statement again. *The rows are flagged as duplicates and not added twice.*
- [ ] Check account balances against your bank afterwards. *They match. If not, use "Preview projected balances" to see where.*
- [ ] Undo the import from **Recent import history**. *Everything it added is removed.*
- [ ] Try a `.xlsx` or `.pdf` file. *A message explaining it isn't a CSV.*

## 5. Accounts, bills, savings, loans

- [ ] Add an account, edit it, reconcile it to a new balance. *The balance updates; no penny rounding errors.*
- [ ] Archive an account with no transactions, then delete it. *Delete is blocked, with the reason, while it still has transactions.*
- [ ] Add a bill, edit it, archive it, delete the archived bill.
- [ ] Add a savings goal and a contribution.
- [ ] Add a student loan, a mortgage and a house. Open each house tab.

## 6. Reports, backup and settings

- [ ] Reports → **Export PDF / Print report**. *A printable report in the new palette.*
- [ ] Export transactions CSV and a JSON backup. *A message says what was saved.*
- [ ] Restore the JSON backup (type RESTORE). *Data comes back; counts match the preview.*
- [ ] Cloud backup → back up now, then preview a cloud backup.
- [ ] Turn off the internet and make a change. *A clear offline message; nothing is lost; the cloud status offers "Try again".*

## 7. Look and feel

- [ ] Light and dark mode on every page. *All text is easy to read; no leftover bright blue, green or purple.*
- [ ] Settings → Appearance: try each highlight colour and one custom colour. *Buttons, the active tab and links stay readable.*
- [ ] Money everywhere looks like £1,234.56; dates like 10 Oct 2026.

## 8. Phone

- [ ] Open the app on a phone (or a window under 720px wide). *The compact layout switches on by itself; nothing scrolls sideways.*
- [ ] Every button is comfortable to tap.
- [ ] Transactions show one per line with the amount on the right; tapping one opens its details.
- [ ] Dashboard: summary cards two per row; the pie chart has a list under it.
- [ ] Install the app (Settings → Install app) and open it from the home screen.

## 9. Keyboard and screen reader

- [ ] Press Tab once on any page. *"Skip to content" appears; Enter jumps past the header.*
- [ ] Open **+ Add Transaction** with the keyboard. *Focus goes into the form, Tab stays inside it, Escape closes it, and focus returns to the button.*
- [ ] Escape closes search, quick actions and notifications.
- [ ] Tab to a dashboard card label ("Income", "Saved") and press Enter. *The breakdown opens.*
- [ ] With VoiceOver/TalkBack on, open a pop-up. *Its title is read out.*
- [ ] Turn on "Reduce motion" on the device. *Charts appear without animating.*
