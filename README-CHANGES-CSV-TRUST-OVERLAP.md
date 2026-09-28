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
