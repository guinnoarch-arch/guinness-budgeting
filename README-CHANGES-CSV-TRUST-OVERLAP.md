# CSV import: overlapping statements, pending transactions and "Trust the CSV"

## Why
Lloyds (and other banks) leave pending payments off a statement until they clear, then list them on the
next statement under their original date. Downloading statements with a few days' overlap catches them,
but the import handled that badly:

- **Two overlapping statements for the same account uploaded together were double-imported.** Neither copy
  existed in the app at preview time, so every shared row was imported twice.
- **A cleared pending payment identical to one already imported was lost.** Two identical rows on the same
  day (e.g. two £20 transfers) both got marked "duplicate" of the one saved transaction.
- **"Diagnose problem" blamed the opening balance on any overlapping statement.** Its row-by-row walk left
  out rows that were already imported, so the first row of an overlapping statement always looked wrong.

## What changed
- **Overlap merging (upload together):** for statements on the same account, the one that runs later wins for
  the days they share. Rows on both are imported once, from the newer one. Rows only on the newer one are
  kept and labelled "most likely pending when the older one was downloaded". Rows only on the older one are
  unticked, with a warning.
- **Overlap with earlier imports:** each saved transaction can only be the duplicate of one CSV row. Rows
  inside a date range an earlier import already covered are labelled as probably pending last time.
  New imports also save their first date and end-of-day balances, so later imports can compare against them.
- **Diagnose problem, rewritten:** it compares the app's end-of-day balance with the bank's for each day,
  using the real import logic on a throwaway copy of the data. It shows:
  - whether the gap was already there before the statement (opening balance), with the existing one-click fix
  - each day the gap moves, listing the rows on the CSV but not in the app (and why) and the items in the app
    but not on the CSV
  - days where overlapping statements disagree on the balance, which is how a pending payment shows up
- **Trust the CSV:** on by default, remembered per browser, and can be switched per account from the
  preview/diagnosis. When on, the import adds dated adjustments wherever the calculated balance still differs
  from the bank's, so the account matches the statement on every day it covers, not just the last one.
  The adjustments belong to the import batch, so **Undo import** removes them too.
- Fixed the single-file reconciliation preview leaving out rows linked to an existing transfer (they create
  this account's own leg, so they do move its balance).

## Side-by-side overlap check
When a CSV starts before the date the app is already up to date to (e.g. the app is up to date to the 10th
and the CSV goes back to the 5th), "Diagnose problem" includes an **Overlap with what's already in the app**
section. For each shared day it shows the bank CSV on the left and what the app already had on the right,
with both end-of-day balances. Matching items sit on the same line, and anything on only one side is
highlighted with the likely reason: this import adds it (e.g. a cleared pending payment), unticked or marked
duplicate, added manually or planned, an earlier balance adjustment, or the same payment dated a day or two
differently. It opens automatically when the statement is already out on its first day, and can be filtered
to only the days that don't line up.

## Check account (Accounts page)
Each account card has a **Check account** button. It opens a day-by-day view of that account (30 days, 90 days,
1 year, all time, or custom dates), newest first. For each day it shows:
- the app's end-of-day balance next to the bank's, taken from past CSV imports (the newest import wins where
  imports overlap; older imports without saved daily balances are rebuilt from the balance on each bank row),
  and how much the gap moved that day
- every transaction and adjustment, with where it came from (which CSV, entered by hand, planned/recurring)
- **possible duplicates**: same amount and direction a day or less apart, e.g. the same bank row imported
  twice, or a payment entered by hand and then imported. Rows from the same statement are never flagged.
  Each has a **Delete this one** button.
- **transfer gaps**: a transfer whose other side is missing, deleted, a different amount or dated far apart.
  If a matching unlinked transaction exists in the other account it's listed with a **Link as transfer** button.

Filters narrow it to possible duplicates, transfer gaps, or days where the gap to the bank moves.
