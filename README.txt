GUINNESS & HOLLEY BUDGETING — MULTI-CSV IMPORT PATCH

This patch is based on the previous CSV transfer/duplicate patch and extends it.

WHAT IT ADDS:
1. Multiple CSV files can be selected in one upload.
2. Each statement appears as its own upload row.
3. Each CSV has its own GH account dropdown.
4. Each CSV has a hidden "Check mapping" dropdown so the detected column mapping can be reviewed/changed without filling the page with mappings.
5. All uploaded statements are analysed together.
6. The combined transaction review is sorted by date, then statement, making missing transfer sides easier to spot.
7. Opposite-sign transactions across different uploaded accounts with the same/similar amount and a date within 3 days are highlighted as likely transfers.
8. The actual import re-checks each later statement against transactions already created by earlier statements. This allows the second side of a transfer to link to the one-sided transfer created from the first CSV, even when the bank description is only the user's name.
9. Existing duplicate comparison/editing from the previous patch is retained.
10. Single-CSV importing still works.

IMPORTANT BEHAVIOUR:
- A pair such as Account A -£100 and Account B +£100 is not treated as a duplicate simply because the values have the same absolute amount.
- When imported as two account statements, the first side can create a one-sided transfer and the second side is then linked to it during the same multi-file import.
- Normal same-account duplicates remain available for comparison and review.

REPLACE THESE FILES IN YOUR PROJECT:
- src/pages/ImportPage.jsx
- src/services/csvImportService.js

No database migration is required.

VALIDATION:
- csvImportService.js passes Node syntax validation.
- The JSX source was inspected after patching. A full Vite build was not run because the supplied patch ZIP contains source files rather than the complete project dependencies.
- Run your normal `npm install`/`npm ci` and `npm run build` in the full project before deploying.

USAGE:
1. Open Import.
2. Select all the CSV statements for the month at once.
3. Choose the GH account beside each file.
4. Expand "Check mapping" on any file where you want to verify the columns.
5. Click "Analyse all CSVs".
6. Review the date-sorted combined list.
7. Check highlighted transfers and duplicate comparisons.
8. Confirm the import.
