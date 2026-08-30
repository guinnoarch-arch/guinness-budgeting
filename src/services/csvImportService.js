import { createId } from "../utils/ids.js";
import { calculateAccountBalanceAtDate } from "../utils/calculations.js";
import { formatIsoDateLocal, todayIsoDate } from "../utils/dates.js";

const DATE_CANDIDATES = ["date", "transaction date", "posted date", "booking date", "value date"];
const TIME_CANDIDATES = ["time", "transaction time", "posted time", "booking time"];
const DESCRIPTION_CANDIDATES = ["description", "transaction description", "transaction details", "transaction narrative", "transaction 2", "transaction", "details", "narrative", "merchant", "name", "reference", "payee", "memo"];
const AMOUNT_CANDIDATES = ["amount", "transaction amount", "value", "paid", "money in/out", "money in out", "net", "signed amount"];
const PAID_IN_CANDIDATES = ["paid in", "credit", "money in", "in", "deposit", "received"];
const PAID_OUT_CANDIDATES = ["paid out", "debit", "money out", "out", "withdrawal", "spent"];
const BALANCE_CANDIDATES = ["balance", "running balance", "closing balance", "available balance", "account balance"];

const TRANSFER_WORDS = [
  "transfer",
  "tfr",
  "internal",
  "move",
  "moved",
  "standing order",
  "savings",
  "current",
  "cash",
  "monzo",
  "revolut",
  "chase",
  "natwest",
  "lloyds",
  "barclays",
  "santander"
];

const CATEGORY_KEYWORDS = [
  { categoryId: "cat_food", words: ["tesco", "sainsbury", "asda", "morrisons", "aldi", "lidl", "coop", "co-op", "waitrose", "grocery", "groceries"] },
  { categoryId: "cat_going_out", words: ["costa", "starbucks", "mcdonald", "greggs", "pub", "bar", "restaurant", "cinema", "deliveroo", "uber eats", "just eat"] },
  { categoryId: "cat_fuel", words: ["shell", "bp", "esso", "fuel", "petrol", "diesel", "texaco"] },
  { categoryId: "cat_car", words: ["insurance", "garage", "parking", "mot", "car tax", "vehicle"] },
  { categoryId: "cat_subscriptions", words: ["spotify", "netflix", "prime", "apple", "icloud", "disney", "youtube", "subscription"] },
  { categoryId: "cat_rent", words: ["rent", "landlord"] },
  { categoryId: "cat_bills", words: ["electric", "gas", "water", "broadband", "phone", "o2", "ee", "vodafone", "utility", "council tax"] },
  { categoryId: "cat_university", words: ["university", "bath", "tuition", "student"] },
  { categoryId: "cat_wages", words: ["payroll", "salary", "wage", "wages", "pay"] },
  { categoryId: "cat_student_loan", words: ["student loan"] },
  { categoryId: "cat_maintenance_loan", words: ["maintenance loan"] },
  { categoryId: "cat_gift", words: ["gift"] },
  { categoryId: "cat_refund", words: ["refund"] },
  { categoryId: "cat_savings_interest", words: ["interest", "gross interest", "savings interest"] }
];

export function parseCsvText(text) {
  const delimiter = detectCsvDelimiter(text);
  const rawRows = parseDelimitedRows(text, delimiter);

  if (rawRows.length === 0) {
    return { headers: [], rows: [], headerRowIndex: -1, delimiter };
  }

  const headerRowIndex = findHeaderRowIndex(rawRows);
  if (headerRowIndex < 0) {
    return { headers: [], rows: [], headerRowIndex: -1, delimiter };
  }

  const headers = makeUniqueHeaders(rawRows[headerRowIndex]);
  const dataRows = rawRows
    .slice(headerRowIndex + 1)
    .filter(values => isUsableDataRow(values, headers))
    .map(values => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = values[index] ?? "";
      });
      return item;
    });

  return {
    headers,
    rows: dataRows,
    headerRowIndex,
    ignoredTopRows: headerRowIndex,
    delimiter
  };
}

function parseDelimitedRows(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(value => value !== "")) rows.push(row);

  return rows;
}

function detectCsvDelimiter(text) {
  const sampleLines = String(text || "")
    .split(/\r?\n/)
    .slice(0, 12)
    .filter(line => line.trim());

  const candidates = [",", ";", "\t"];
  const scores = candidates.map(delimiter => ({
    delimiter,
    score: sampleLines.reduce((total, line) => total + countDelimiterOutsideQuotes(line, delimiter), 0)
  }));

  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score > 0 ? scores[0].delimiter : ",";
}

function countDelimiterOutsideQuotes(line, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') index += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) count += 1;
  }
  return count;
}

function findHeaderRowIndex(rows) {
  const scoredRows = rows.slice(0, 20).map((row, index) => ({
    index,
    score: scoreHeaderRow(row)
  }));

  const best = scoredRows.sort((a, b) => b.score - a.score || a.index - b.index)[0];
  if (best && best.score >= 20) return best.index;

  return rows.findIndex(row => row.filter(value => String(value || "").trim()).length > 1);
}

function scoreHeaderRow(row) {
  const values = row.map(value => normaliseText(value));
  const nonEmpty = values.filter(Boolean);
  if (nonEmpty.length < 2) return 0;

  const candidateGroups = [
    DATE_CANDIDATES,
    TIME_CANDIDATES,
    DESCRIPTION_CANDIDATES,
    AMOUNT_CANDIDATES,
    PAID_IN_CANDIDATES,
    PAID_OUT_CANDIDATES,
    BALANCE_CANDIDATES,
    ["time", "currency", "type", "transaction type"]
  ];

  let score = nonEmpty.length;
  let hasDate = false;
  let hasMoneyColumn = false;

  values.forEach(value => {
    if (!value) return;
    candidateGroups.forEach(group => {
      const matched = group.some(candidate => value === candidate || value.includes(candidate));
      if (matched) score += 10;
    });
    if (DATE_CANDIDATES.some(candidate => value === candidate || value.includes(candidate))) hasDate = true;
    if ([...AMOUNT_CANDIDATES, ...PAID_IN_CANDIDATES, ...PAID_OUT_CANDIDATES, ...BALANCE_CANDIDATES].some(candidate => value === candidate || value.includes(candidate))) {
      hasMoneyColumn = true;
    }
  });

  if (hasDate) score += 12;
  if (hasMoneyColumn) score += 12;
  if (hasDate && hasMoneyColumn) score += 20;

  return score;
}

function makeUniqueHeaders(rawHeaders) {
  const used = new Map();
  return rawHeaders.map((rawHeader, index) => {
    const base = String(rawHeader || "").trim() || `Column ${index + 1}`;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base} ${count + 1}`;
  });
}

function isUsableDataRow(values, headers) {
  const nonEmpty = values.filter(value => String(value || "").trim()).length;
  if (nonEmpty < 2) return false;

  const normalisedValues = values.map(value => normaliseText(value));
  const normalisedHeaders = headers.map(header => normaliseText(header));
  const repeatedHeaderCells = normalisedValues.filter((value, index) => value && value === normalisedHeaders[index]).length;

  return repeatedHeaderCells < Math.max(2, Math.ceil(headers.length / 2));
}

export function suggestColumnMap(headers) {
  return {
    date: findHeader(headers, DATE_CANDIDATES),
    time: findHeader(headers, TIME_CANDIDATES),
    description: findHeader(headers, DESCRIPTION_CANDIDATES),
    amount: findHeader(headers, AMOUNT_CANDIDATES),
    paidIn: findHeader(headers, PAID_IN_CANDIDATES),
    paidOut: findHeader(headers, PAID_OUT_CANDIDATES),
    balance: findHeader(headers, BALANCE_CANDIDATES)
  };
}

export function buildCsvHeaderSignature(headers = []) {
  return headers
    .map(header => normaliseText(header))
    .filter(Boolean)
    .join("|");
}

export function findSavedCsvColumnMapping(data, headers = []) {
  const signature = buildCsvHeaderSignature(headers);
  if (!signature) return null;
  return (data.csvColumnMappings || []).find(mapping => mapping.headerSignature === signature) || null;
}

export function analyseCsvImport(data, { accountId, fileName, headers, rows, columnMap }) {
  const now = new Date().toISOString();
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalisedMappings = data.externalAccountMappings || [];
  const transferRules = data.transferRules || [];
  const importRules = data.importRules || [];
  // Built once per import instead of re-scanning every existing transaction
  // for every CSV row (previously 4 full linear scans per row).
  const matchIndex = buildTransactionMatchIndex(data.transactions, data.accounts);

  const previewRows = safeRows
    .map((row, rowIndex) => buildPreviewRow({
      data,
      row,
      rowIndex,
      accountId,
      columnMap,
      normalisedMappings,
      transferRules,
      importRules,
      matchIndex,
      now
    }))
    .filter(Boolean);

  const csvBalanceRows = previewRows.filter(row => row.balance !== null && row.balance !== undefined && row.date);
  const balanceChainCheck = checkCsvBalanceChain(csvBalanceRows);
  // When multiple rows share the same date, the file's own row order is the
  // only way to tell which one actually happened later — but only once we
  // know which direction that order runs. Most banks list oldest-first, but
  // plenty (Lloyds among them) list newest-first. Assuming "later row index
  // = more recent" is wrong for those, and silently picks a same-day
  // balance that isn't really the statement's closing balance. Reuse the
  // same order detection that powers the balance-chain check above so both
  // agree on which direction is chronological.
  const newestFirst = balanceChainCheck.order === "reversed";
  const latestBalanceRow = csvBalanceRows.length > 0
    ? [...csvBalanceRows].sort((a, b) => {
        const dateDiff = a.date.localeCompare(b.date);
        if (dateDiff !== 0) return dateDiff;
        return newestFirst ? b.rowIndex - a.rowIndex : a.rowIndex - b.rowIndex;
      }).at(-1)
    : null;

  const latestCsvDate = previewRows
    .filter(row => row.date)
    .map(row => row.date)
    .sort()
    .at(-1) || null;

  const today = todayIsoDate();
  const hasNewerGbTransactions = latestCsvDate
    ? (data.transactions || []).some(transaction => transactionTouchesAccount(transaction, accountId) && transaction.date > latestCsvDate)
    : false;

  const reconciliation = latestBalanceRow
    ? {
        available: true,
        latestCsvDate: latestBalanceRow.date,
        csvClosingBalance: latestBalanceRow.balance,
        isCurrentToToday: latestBalanceRow.date === today && !hasNewerGbTransactions,
        hasNewerGbTransactions,
        comparisonMode: latestBalanceRow.date === today && !hasNewerGbTransactions ? "current" : "historical",
        message: latestBalanceRow.date === today && !hasNewerGbTransactions
          ? "CSV is current enough to compare against the current GB balance after import."
          : "CSV is older than the latest GB position, so compare against the GB balance at the CSV date."
      }
    : {
        available: false,
        latestCsvDate,
        csvClosingBalance: null,
        isCurrentToToday: false,
        hasNewerGbTransactions,
        comparisonMode: "none",
        message: "No balance column was mapped, so reconciliation cannot run."
      };

  return {
    id: createId("analysis"),
    fileName,
    accountId,
    headers,
    columnMap,
    createdAt: now,
    rows: previewRows,
    totals: summarisePreviewRows(previewRows),
    reconciliation,
    balanceChainCheck
  };
}

// The bank's own running-balance column is ground truth for whether we parsed
// this file correctly — independent of anything already in the app. Walking
// balance[i-1] + signedAmount[i] === balance[i] catches parsing mistakes
// (wrong column mapped, inverted sign, a skipped or duplicated row) before
// they ever reach the transaction-matching logic, which has no way to tell a
// correctly-parsed row from a wrongly-signed one on its own.
//
// Statements aren't always listed oldest-first, so if the file's own row
// order doesn't reconcile, this retries once against the reverse order
// before giving up — that's a normal "newest first" export, not an error.
function checkCsvBalanceChain(csvBalanceRows) {
  if (csvBalanceRows.length < 2) {
    return {
      checked: false,
      reason: csvBalanceRows.length === 0 ? "no_balance_column" : "not_enough_balance_rows",
      message: csvBalanceRows.length === 0
        ? "No balance column was mapped, so the running-balance check can't run."
        : "Only one row has a balance value, so there isn't a chain to check."
    };
  }

  const fileOrder = csvBalanceRows;
  const reversedOrder = [...csvBalanceRows].reverse();

  const forward = runBalanceChain(fileOrder);
  if (forward.mismatchCount === 0) {
    return {
      checked: true,
      reconciled: true,
      order: "file_order",
      ...forward,
      message: `Running balance reconciles: ${formatAmountForNote(forward.openingBalance)} on ${forward.firstDate} to ${formatAmountForNote(forward.closingBalance)} on ${forward.lastDate} across ${forward.rowsChecked} row(s).`
    };
  }

  const reversed = runBalanceChain(reversedOrder);
  if (reversed.mismatchCount === 0) {
    return {
      checked: true,
      reconciled: true,
      order: "reversed",
      ...reversed,
      message: `Running balance reconciles once read newest-first-to-oldest: ${formatAmountForNote(reversed.openingBalance)} to ${formatAmountForNote(reversed.closingBalance)} across ${reversed.rowsChecked} row(s).`
    };
  }

  const best = forward.mismatchCount <= reversed.mismatchCount ? forward : reversed;
  const bestOrder = best === forward ? "file_order" : "reversed";
  const worstMismatch = [...best.mismatches].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))[0];

  return {
    checked: true,
    reconciled: false,
    order: bestOrder,
    ...best,
    message: worstMismatch
      ? `Running balance doesn't add up: ${best.mismatchCount} row(s) break the chain, largest gap ${formatAmountForNote(worstMismatch.difference)} at "${worstMismatch.description}" on ${worstMismatch.date}. Check the column mapping (amount / paid in / paid out) is correct for this file.`
      : `Running balance doesn't add up by ${formatAmountForNote(best.finalDifference)} from ${best.openingBalance !== null ? formatAmountForNote(best.openingBalance) : "the opening balance"} to ${best.closingBalance !== null ? formatAmountForNote(best.closingBalance) : "the closing balance"}. Check the column mapping for this file.`
  };
}

function runBalanceChain(list) {
  let expected = list[0].balance;
  const mismatches = [];

  for (let index = 1; index < list.length; index += 1) {
    const row = list[index];
    expected = roundMoney(expected + row.signedAmount);
    const difference = roundMoney(expected - row.balance);

    if (Math.abs(difference) > 0.01) {
      mismatches.push({
        rowIndex: row.rowIndex,
        date: row.date,
        description: row.description,
        expectedBalance: expected,
        actualBalance: row.balance,
        difference
      });
      // Resync to this row's actual balance so one bad row doesn't cascade
      // false mismatches through every row after it.
      expected = row.balance;
    }
  }

  return {
    firstDate: list[0].date,
    lastDate: list[list.length - 1].date,
    openingBalance: list[0].balance,
    closingBalance: list[list.length - 1].balance,
    rowsChecked: list.length,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 10),
    finalDifference: roundMoney(expected - list[list.length - 1].balance)
  };
}

export function applyCsvImport(data, analysis, rowEdits = {}, options = {}) {
  const now = new Date().toISOString();
  const accountId = analysis.accountId;
  const importBatchId = createId("import");

  let nextData = {
    ...data,
    transactions: [...(data.transactions || [])],
    accountAdjustments: [...(data.accountAdjustments || [])],
    importBatches: [...(data.importBatches || [])],
    importRules: [...(data.importRules || [])],
    transferRules: [...(data.transferRules || [])],
    externalAccountMappings: [...(data.externalAccountMappings || [])],
    csvColumnMappings: [...(data.csvColumnMappings || [])]
  };

  const importedTransactionIds = [];
  const linkedTransactionIds = [];
  const skippedRows = [];

  analysis.rows.forEach(previewRow => {
    const edit = rowEdits[previewRow.id] || {};
    const effectivePreviewRow = {
      ...previewRow,
      date: edit.date || previewRow.date,
      description: edit.description || previewRow.description,
      amount: Number(edit.amount ?? previewRow.amount),
      signedAmount: (Number(edit.amount ?? previewRow.amount) || 0) * (previewRow.signedAmount < 0 ? -1 : 1)
    };
    const include = edit.include ?? previewRow.defaultInclude;
    if (!include) {
      skippedRows.push({ rowIndex: previewRow.rowIndex, reason: "not_selected" });
      return;
    }

    const rowAction = edit.action || previewRow.action;
    const linkedAccountId = edit.linkedAccountId || previewRow.linkedAccountId || null;
    const matchTransactionId = edit.matchTransactionId || previewRow.matchTransactionId || null;

    const bankRow = buildMatchedBankRow(effectivePreviewRow, importBatchId, accountId);

    if (rowAction === "duplicate") {
      skippedRows.push({ rowIndex: previewRow.rowIndex, reason: "duplicate" });
      return;
    }

    const existingMatch = matchTransactionId ? nextData.transactions.find(transaction => transaction.id === matchTransactionId) : null;
    // A transfer only ever has two real legs, and a planned/manual
    // transaction can only ever be confirmed by one real bank row. Preview
    // analysis for a whole file is computed once upfront, so two different
    // rows in the *same* file can each independently be told "this matches
    // transaction X" when X was still unconfirmed at analysis time — but by
    // the time the second row is actually applied, the first row has
    // already completed it. Blindly merging would silently absorb this row
    // into an unrelated match instead of it becoming its own transaction.
    const matchIsStale = existingMatch?.type === "transfer" && existingMatch.status === "matched";
    const plannedMatchIsStale = Boolean(existingMatch) && existingMatch.type !== "transfer" && (existingMatch.matchedBankRows || []).length > 0;

    if (rowAction === "match_existing_transfer" && matchTransactionId && !matchIsStale) {
      if (existingMatch?.type !== "transfer" && linkedAccountId && linkedAccountId !== accountId) {
        nextData.transactions = nextData.transactions.map(transaction => {
          if (transaction.id !== matchTransactionId) return transaction;
          return convertToLinkedTransfer(transaction, effectivePreviewRow, bankRow, accountId, linkedAccountId, now);
        });
      } else {
        nextData.transactions = nextData.transactions.map(transaction => {
          if (transaction.id !== matchTransactionId) return transaction;
          return mergeImportedTransaction(transaction, effectivePreviewRow, bankRow, now, true);
        });
      }
      linkedTransactionIds.push(matchTransactionId);
      rememberTransferMappings(nextData, effectivePreviewRow, accountId, linkedAccountId, now);
      return;
    }

    if (rowAction === "match_planned" && matchTransactionId && !plannedMatchIsStale) {
      const finalCategoryIdForPlanned = edit.categoryId || previewRow.categoryId || getFallbackCategoryId(nextData, edit.type || previewRow.type);
      nextData.transactions = nextData.transactions.map(transaction => {
        if (transaction.id !== matchTransactionId) return transaction;
        return mergeImportedTransaction(transaction, effectivePreviewRow, bankRow, now, false, Boolean(edit.excludeFromBudget ?? false));
      });
      linkedTransactionIds.push(matchTransactionId);
      rememberCategoryRule(nextData, effectivePreviewRow, finalCategoryIdForPlanned, edit.type || previewRow.type, now);
      return;
    }

    // A stale match means the row this was told to attach to is no longer
    // available — the real match was claimed by a sibling row. If this row's
    // own linked-account guess points at that same counterpart account,
    // manufacturing a second transfer there would credit or debit it again
    // for what the bank only recorded once, so fall back to its own natural
    // income/expense direction and leave it for the user to review. But if
    // the guess points somewhere genuinely different (e.g. its real match
    // just hasn't been imported yet because that statement comes later in
    // this batch), that's independent evidence worth keeping — only the
    // specific stale link is being distrusted, not everything this row knows.
    const existingMatchCounterpart = existingMatch?.type === "transfer"
      ? (existingMatch.fromAccountId === accountId ? existingMatch.toAccountId : existingMatch.fromAccountId)
      : null;
    const staleMatchTargetsSameAccount = (matchIsStale || plannedMatchIsStale)
      && (!linkedAccountId || linkedAccountId === existingMatchCounterpart);
    const finalType = staleMatchTargetsSameAccount ? previewRow.baseType : (edit.type || previewRow.type);
    const finalCategoryId = finalType === "transfer" ? null : (edit.categoryId || previewRow.categoryId || getFallbackCategoryId(nextData, finalType));
    const finalExcludeFromBudget = finalType === "expense" ? Boolean(edit.excludeFromBudget ?? false) : false;

    if (finalType === "transfer") {
      if (!linkedAccountId || linkedAccountId === accountId) {
        skippedRows.push({ rowIndex: previewRow.rowIndex, reason: "transfer_missing_other_account" });
        return;
      }

      const transfer = buildTransferTransaction(effectivePreviewRow, accountId, linkedAccountId, bankRow, now);
      nextData.transactions = [transfer, ...nextData.transactions];
      importedTransactionIds.push(transfer.id);
      rememberTransferMappings(nextData, effectivePreviewRow, accountId, linkedAccountId, now);
      return;
    }

    const transaction = buildStandardTransaction(effectivePreviewRow, accountId, finalType, finalCategoryId, bankRow, now, finalExcludeFromBudget);
    nextData.transactions = [transaction, ...nextData.transactions];
    importedTransactionIds.push(transaction.id);
    rememberCategoryRule(nextData, effectivePreviewRow, finalCategoryId, finalType, now);
  });

  let reconciliationAdjustment = null;

  if (options.createReconciliationAdjustment && analysis.reconciliation?.available) {
    const checkDate = analysis.reconciliation.latestCsvDate;
    const csvBalance = Number(analysis.reconciliation.csvClosingBalance);
    const gbBalanceAtDate = calculateAccountBalanceAtDate(nextData, accountId, checkDate);
    const difference = roundMoney(csvBalance - gbBalanceAtDate);

    if (Math.abs(difference) >= 0.005) {
      reconciliationAdjustment = {
        id: createId("adj"),
        accountId,
        date: checkDate,
        amount: difference,
        note: `CSV balance reconciliation from ${analysis.fileName || "CSV import"}. Matched bank balance ${formatAmountForNote(csvBalance)} on ${checkDate}.`,
        source: "csv_import_reconciliation",
        importBatchId,
        createdAt: now
      };
      nextData.accountAdjustments = [reconciliationAdjustment, ...nextData.accountAdjustments];
    }
  }

  rememberCsvColumnMapping(nextData, analysis, accountId, now);

  const importBatch = {
    id: importBatchId,
    fileName: analysis.fileName || "CSV import",
    accountId,
    importedAt: now,
    totalRows: analysis.rows.length,
    importedRows: importedTransactionIds.length,
    linkedRows: linkedTransactionIds.length,
    skippedRows: skippedRows.length,
    transactionIds: importedTransactionIds,
    linkedTransactionIds,
    skippedRowDetails: skippedRows,
    latestCsvDate: analysis.reconciliation?.latestCsvDate || null,
    csvClosingBalance: analysis.reconciliation?.csvClosingBalance ?? null,
    reconciliationStatus: reconciliationAdjustment
      ? "adjustment_created"
      : analysis.reconciliation?.available
        ? "checked_no_adjustment_created"
        : "not_available",
    reconciliationAdjustmentId: reconciliationAdjustment?.id || null,
    columnMap: analysis.columnMap,
    headerSignature: buildCsvHeaderSignature(analysis.headers || []),
    actionCounts: summarisePreviewRows(analysis.rows || [])
  };

  nextData.importBatches = [importBatch, ...nextData.importBatches];

  return {
    data: nextData,
    result: {
      importBatch,
      importedTransactionIds,
      linkedTransactionIds,
      skippedRows,
      reconciliationAdjustment
    }
  };
}


export function undoCsvImport(data, importBatchId) {
  const batch = (data.importBatches || []).find(item => item.id === importBatchId);
  if (!batch) {
    return {
      data,
      result: {
        removedTransactions: 0,
        unlinkedTransactions: 0,
        removedAdjustments: 0
      }
    };
  }

  const importedIds = new Set(batch.transactionIds || []);
  const linkedIds = new Set(batch.linkedTransactionIds || []);
  let removedTransactions = 0;
  let unlinkedTransactions = 0;

  const transactions = (data.transactions || [])
    .filter(transaction => {
      const shouldRemove = importedIds.has(transaction.id);
      if (shouldRemove) removedTransactions += 1;
      return !shouldRemove;
    })
    .map(transaction => {
      if (!linkedIds.has(transaction.id)) return transaction;

      const existingBankRows = Array.isArray(transaction.matchedBankRows) ? transaction.matchedBankRows : [];
      const nextBankRows = existingBankRows.filter(row => row.importBatchId !== importBatchId);
      if (nextBankRows.length === existingBankRows.length) return transaction;

      unlinkedTransactions += 1;
      const noBankRowsLeft = nextBankRows.length === 0;

      if (!noBankRowsLeft) {
        return {
          ...transaction,
          matchedBankRows: nextBankRows,
          status: transaction.type === "transfer" && nextBankRows.length < 2 ? "one_side_imported" : "matched",
          updatedAt: new Date().toISOString()
        };
      }

      return {
        ...transaction,
        date: transaction.plannedDate || transaction.date,
        amount: transaction.plannedAmount ?? transaction.amount,
        actualDate: null,
        actualAmount: null,
        status: transaction.plannedDate || transaction.plannedAmount !== null && transaction.plannedAmount !== undefined ? "planned" : "confirmed",
        importSource: transaction.importSource === "csv" ? null : transaction.importSource,
        matchedBankRows: [],
        updatedAt: new Date().toISOString()
      };
    });

  const beforeAdjustments = (data.accountAdjustments || []).length;
  const accountAdjustments = (data.accountAdjustments || []).filter(adjustment => adjustment.importBatchId !== importBatchId);
  const removedAdjustments = beforeAdjustments - accountAdjustments.length;

  return {
    data: {
      ...data,
      transactions,
      accountAdjustments,
      importBatches: (data.importBatches || []).filter(item => item.id !== importBatchId)
    },
    result: {
      removedTransactions,
      unlinkedTransactions,
      removedAdjustments
    }
  };
}

function buildPreviewRow({ data, row, rowIndex, accountId, columnMap, normalisedMappings, transferRules, importRules, matchIndex }) {
  const rawDate = getCell(row, columnMap.date);
  const rawDescription = getCell(row, columnMap.description);
  const description = rawDescription || `CSV row ${rowIndex + 2}`;
  const date = parseDate(rawDate);
  // Fall back to pulling a time out of the date column itself when there's
  // no separate Time column mapped — some banks (Revolut among them) only
  // export a single combined date+time column, and without this the time
  // information in it was simply discarded, weakening same-day match
  // precision for every row from that file.
  const time = columnMap.time ? parseTime(getCell(row, columnMap.time)) : parseTime(rawDate);
  const amountInfo = parseAmountFromRow(row, columnMap);
  const amount = amountInfo.amount;
  const balance = columnMap.balance ? parseMoney(getCell(row, columnMap.balance)) : null;

  if (!date || amount === null || amount === 0) return null;

  const signedAmount = amount;
  const absoluteAmount = Math.abs(signedAmount);
  const baseType = signedAmount >= 0 ? "income" : "expense";
  const normalisedDescription = normaliseText(description);
  const sourceRowHash = createSourceRowHash({ accountId, date, amount: signedAmount, description });

  const oppositeAccountMatch = findOppositeSignAccountMatch(matchIndex, accountId, date, time, signedAmount, description);
  const existingDuplicate = oppositeAccountMatch ? null : findExistingImportedRow(matchIndex, sourceRowHash, accountId, date, time, signedAmount, description);
  const mappedExternalAccount = findExternalAccountMatch(normalisedMappings, description);
  const transferRule = findTransferRule(transferRules, accountId, description);
  const likelyTransfer = Boolean(transferRule || mappedExternalAccount || isLikelyTransferDescription(description));
  let linkedAccountId = transferRule?.linkedAccountId || mappedExternalAccount?.gbAccountId || null;
  // Never let a row link "to itself" — this can only mean a learned rule or
  // mapping was mis-formed (e.g. from a coincidental text match), and using
  // it would make the transfer-matching below silently fail, which then
  // falls through to being misread as a duplicate instead.
  if (linkedAccountId === accountId) linkedAccountId = null;
  // Always check for an existing transfer once we know the account/date/amount.
  // This is important for multi-CSV imports: the first statement may create the
  // one-sided transfer, and a later statement must be able to attach its
  // opposite-sign row even when the bank description is just the user's name.
  const existingTransferMatch = oppositeAccountMatch
    ? oppositeAccountMatch
    : findExistingTransferMatch(matchIndex, accountId, linkedAccountId, date, time, signedAmount);
  const plannedMatch = !existingTransferMatch && !existingDuplicate
    ? findPlannedMatch(data, matchIndex, accountId, date, signedAmount, description, likelyTransfer)
    : null;

  const suggestedCategoryId = suggestCategoryId(data, baseType, description, importRules);
  const largeExpenseThreshold = Number(data.settings?.largeExpenseThreshold || 200);
  const suggestedExcludeFromBudget = baseType === "expense" && absoluteAmount >= largeExpenseThreshold;
  const externalAccountName = extractExternalAccountName(description, data.accounts, mappedExternalAccount);

  let action = "new";
  let actionLabel = "New transaction";
  let type = baseType;
  let matchTransactionId = null;
  let defaultInclude = true;
  let warning = "";

  if (existingTransferMatch && existingTransferMatch.matchKind === "opposite_sign_account") {
    action = "match_existing_transfer";
    actionLabel = "Opposite-sign match → transfer";
    type = "transfer";
    matchTransactionId = existingTransferMatch.id;
    linkedAccountId = existingTransferMatch.accountId;
    // This is a text-similarity guess, not a hard match on a shared reference —
    // merging two independently-tracked transactions into a transfer removes
    // both from income/expense totals, so a weak match must never be
    // auto-applied. Only skip the review step when the descriptions actually
    // matched exactly; otherwise require the user to confirm it first.
    defaultInclude = Boolean(existingTransferMatch.exactText);
    warning = existingTransferMatch.exactText
      ? `Possible transfer: matches ${existingTransferMatch.accountName || "another account"} for the same amount on a nearby date.`
      : `Unconfirmed possible transfer: similar wording to a transaction in ${existingTransferMatch.accountName || "another account"} for the same amount on a nearby date. Review before importing — not auto-selected.`;
  } else if (existingTransferMatch) {
    // An already-started transfer (e.g. the other side was imported from a
    // previous CSV) always wins over the duplicate heuristic below, otherwise
    // completing a transfer on the second statement gets misread as a
    // duplicate and left unticked instead of linking the two sides together.
    action = "match_existing_transfer";
    actionLabel = "Link to existing transfer";
    type = "transfer";
    matchTransactionId = existingTransferMatch.id;
    linkedAccountId = linkedAccountId
      || (existingTransferMatch.fromAccountId === accountId ? existingTransferMatch.toAccountId : existingTransferMatch.fromAccountId);
  } else if (existingDuplicate) {
    action = "duplicate";
    actionLabel = "Already imported / duplicate";
    defaultInclude = false;
    matchTransactionId = existingDuplicate.id;
    warning = "This looks like an existing transaction. Compare both before deciding.";
  } else if (plannedMatch) {
    action = "match_planned";
    actionLabel = "Link to planned transaction";
    type = plannedMatch.type || baseType;
    matchTransactionId = plannedMatch.id;
    warning = plannedMatch.amountDifference
      ? `Actual amount differs by ${formatAmountForNote(plannedMatch.amountDifference)}.`
      : "";
  } else if (likelyTransfer) {
    action = "new_transfer";
    actionLabel = linkedAccountId ? "New transfer" : "Choose transfer account";
    type = "transfer";
    // A "new transfer" here means no matching transaction was found on the
    // other side — the linked account (if any) came only from a keyword or a
    // previously learned text rule, never from real corroborating data. A
    // learned rule keeps firing on every future row with similar wording
    // even if the original match that taught it was wrong, so it must never
    // silently create a transfer (which removes the row from income/expense
    // totals) without the user confirming it first.
    defaultInclude = false;
    warning = linkedAccountId
      ? `Guessed transfer to ${getAccountName(data, linkedAccountId)} based on wording, but no matching transaction was found on that side. Review before importing — not auto-selected.`
      : "Choose the other GB account before importing this transfer.";
  }

  if (suggestedExcludeFromBudget) {
    warning = warning
      ? `${warning} Large expense over ${formatAmountForNote(largeExpenseThreshold)}: consider excluding from monthly budget.`
      : `Large expense over ${formatAmountForNote(largeExpenseThreshold)}: consider excluding from monthly budget.`;
  }

  return {
    id: `csv_row_${rowIndex}`,
    rowIndex,
    raw: row,
    sourceRowHash,
    date,
    time,
    description,
    normalisedDescription,
    signedAmount,
    amount: absoluteAmount,
    balance,
    type,
    baseType,
    categoryId: type === "transfer" ? null : suggestedCategoryId,
    linkedAccountId,
    matchTransactionId,
    action,
    actionLabel,
    defaultInclude,
    warning,
    suggestedExcludeFromBudget,
    externalAccountName,
    confidence: getConfidenceLabel(action, plannedMatch, existingTransferMatch),
    matchedTitle: plannedMatch?.title || existingTransferMatch?.title || existingDuplicate?.title || null,
    duplicateTransactionId: existingDuplicate?.id || null,
    duplicateTransaction: existingDuplicate ? {
      id: existingDuplicate.id,
      type: existingDuplicate.type,
      date: existingDuplicate.date,
      amount: existingDuplicate.amount,
      title: existingDuplicate.title || "",
      note: existingDuplicate.note || "",
      categoryId: existingDuplicate.categoryId || "",
      accountId: existingDuplicate.accountId || null
    } : null,
    plannedDate: plannedMatch?.date || null,
    plannedAmount: plannedMatch?.amount ?? null,
    actualDate: date,
    actualAmount: absoluteAmount,
    amountDifference: plannedMatch?.amountDifference ?? null,
    dateDifference: plannedMatch ? daysBetween(plannedMatch.date, date) : null
  };
}

function buildStandardTransaction(previewRow, accountId, type, categoryId, bankRow, now, excludeFromBudget = false) {
  return {
    id: createId("txn"),
    type,
    date: previewRow.date,
    amount: previewRow.amount,
    title: cleanTitle(previewRow.description),
    note: `Imported from CSV. Bank description: ${previewRow.description}`,
    categoryId,
    accountId,
    fromAccountId: null,
    toAccountId: null,
    linkedSavingsGoalId: null,
    recurringItemId: null,
    isRecurring: false,
    excludeFromBudget: type === "expense" ? Boolean(excludeFromBudget) : false,
    isExample: false,
    status: "imported",
    importSource: "csv",
    matchedBankRows: [bankRow],
    plannedDate: null,
    plannedAmount: null,
    actualDate: previewRow.date,
    actualAmount: previewRow.amount,
    createdAt: now,
    updatedAt: now
  };
}

function buildTransferTransaction(previewRow, uploadedAccountId, linkedAccountId, bankRow, now) {
  const isMoneyIntoUploadedAccount = previewRow.signedAmount > 0;
  const fromAccountId = isMoneyIntoUploadedAccount ? linkedAccountId : uploadedAccountId;
  const toAccountId = isMoneyIntoUploadedAccount ? uploadedAccountId : linkedAccountId;

  return {
    id: createId("txn"),
    type: "transfer",
    date: previewRow.date,
    amount: previewRow.amount,
    title: cleanTitle(previewRow.description),
    note: `Imported transfer from CSV. Bank description: ${previewRow.description}`,
    categoryId: null,
    accountId: null,
    fromAccountId,
    toAccountId,
    linkedSavingsGoalId: null,
    recurringItemId: null,
    isRecurring: false,
    isExample: false,
    status: "one_side_imported",
    importSource: "csv",
    matchedBankRows: [bankRow],
    plannedDate: null,
    plannedAmount: null,
    actualDate: previewRow.date,
    actualAmount: previewRow.amount,
    createdAt: now,
    updatedAt: now
  };
}

function convertToLinkedTransfer(transaction, previewRow, bankRow, uploadedAccountId, linkedAccountId, now) {
  const existingWasIncoming = getSignedAmountForAccount(transaction, transaction.accountId) > 0;
  const fromAccountId = existingWasIncoming ? transaction.accountId : uploadedAccountId;
  const toAccountId = existingWasIncoming ? uploadedAccountId : transaction.accountId;
  const existingBankRows = Array.isArray(transaction.matchedBankRows) ? transaction.matchedBankRows : [];
  const nextBankRows = existingBankRows.some(row => row.sourceRowHash === bankRow.sourceRowHash)
    ? existingBankRows
    : [bankRow, ...existingBankRows];

  return {
    ...transaction,
    type: "transfer",
    accountId: null,
    fromAccountId,
    toAccountId,
    categoryId: null,
    date: transaction.date || previewRow.date,
    amount: previewRow.amount,
    status: nextBankRows.length >= 2 ? "matched" : "one_side_imported",
    importSource: transaction.importSource || "csv",
    actualDate: previewRow.date,
    actualAmount: previewRow.amount,
    excludeFromBudget: false,
    matchedBankRows: nextBankRows,
    note: `${transaction.note || ""}${transaction.note ? "\n" : ""}Converted to transfer after opposite-sign CSV match: ${previewRow.description}`,
    updatedAt: now
  };
}

function mergeImportedTransaction(transaction, previewRow, bankRow, now, isTransferMatch, excludeFromBudget = transaction.excludeFromBudget) {
  const existingBankRows = Array.isArray(transaction.matchedBankRows) ? transaction.matchedBankRows : [];
  const alreadyLinked = existingBankRows.some(row => row.sourceRowHash === bankRow.sourceRowHash);
  const nextBankRows = alreadyLinked ? existingBankRows : [bankRow, ...existingBankRows];

  return {
    ...transaction,
    plannedDate: transaction.plannedDate || transaction.date,
    plannedAmount: transaction.plannedAmount ?? transaction.amount,
    actualDate: previewRow.date,
    actualAmount: previewRow.amount,
    date: isTransferMatch ? transaction.date : previewRow.date,
    amount: previewRow.amount,
    status: isTransferMatch && nextBankRows.length < 2 ? "one_side_imported" : "matched",
    excludeFromBudget: transaction.type === "expense" ? Boolean(excludeFromBudget) : false,
    importSource: transaction.importSource || "csv",
    matchedBankRows: nextBankRows,
    note: transaction.note
      ? `${transaction.note}\nMatched CSV row: ${previewRow.description}`
      : `Matched CSV row: ${previewRow.description}`,
    updatedAt: now
  };
}

function buildMatchedBankRow(previewRow, importBatchId, accountId) {
  return {
    importBatchId,
    accountId,
    sourceRowHash: previewRow.sourceRowHash,
    rowIndex: previewRow.rowIndex,
    date: previewRow.date,
    time: previewRow.time || null,
    amount: previewRow.signedAmount,
    absoluteAmount: previewRow.amount,
    description: previewRow.description,
    balance: previewRow.balance ?? null
  };
}

function rememberTransferMappings(data, previewRow, uploadedAccountId, linkedAccountId, now) {
  if (!linkedAccountId) return;

  const phrase = getRulePhrase(previewRow.description);
  const direction = previewRow.signedAmount < 0 ? "out" : "in";

  if (phrase && !(data.transferRules || []).some(rule => rule.uploadedAccountId === uploadedAccountId && rule.matchText === phrase)) {
    data.transferRules = [
      {
        id: createId("transfer_rule"),
        matchText: phrase,
        uploadedAccountId,
        linkedAccountId,
        direction,
        createdAt: now,
        lastUsedAt: now
      },
      ...(data.transferRules || [])
    ];
  }

  if (previewRow.externalAccountName && !(data.externalAccountMappings || []).some(mapping => normaliseText(mapping.externalName) === normaliseText(previewRow.externalAccountName))) {
    data.externalAccountMappings = [
      {
        id: createId("external_map"),
        externalName: previewRow.externalAccountName,
        gbAccountId: linkedAccountId,
        matchType: "contains",
        source: "csv_transfer_description",
        createdAt: now,
        lastUsedAt: now
      },
      ...(data.externalAccountMappings || [])
    ];
  }
}

// Inverse of rememberTransferMappings — used when the user says a guessed
// transfer was wrong. Removes every learned rule/mapping that would still
// fire on this same description for this account, so the same wrong guess
// doesn't keep coming back on the next import. Uses the exact same
// selection predicates as findTransferRule/findExternalAccountMatch so
// "forget" removes precisely what "remember" would apply.
export function forgetTransferGuess(data, { accountId, description, externalAccountName }) {
  const text = normaliseText(description);

  const transferRules = (data.transferRules || []).filter(rule => {
    if (rule.uploadedAccountId !== accountId) return true;
    const match = normaliseText(rule.matchText);
    return !(match && text.includes(match));
  });

  const externalAccountMappings = (data.externalAccountMappings || []).filter(mapping => {
    if (!externalAccountName) return true;
    return normaliseText(mapping.externalName) !== normaliseText(externalAccountName);
  });

  return {
    data: { ...data, transferRules, externalAccountMappings },
    removedRuleCount: (data.transferRules || []).length - transferRules.length,
    removedMappingCount: (data.externalAccountMappings || []).length - externalAccountMappings.length
  };
}

function rememberCategoryRule(data, previewRow, categoryId, type, now) {
  if (!categoryId || !previewRow.description || previewRow.description.length < 4) return;
  const phrase = getRulePhrase(previewRow.description);
  if (!phrase) return;

  const exists = (data.importRules || []).some(rule => rule.matchText === phrase && rule.transactionType === type);
  if (exists) return;

  data.importRules = [
    {
      id: createId("import_rule"),
      matchText: phrase,
      categoryId,
      transactionType: type,
      createdAt: now,
      lastUsedAt: now
    },
    ...(data.importRules || [])
  ];
}

function rememberCsvColumnMapping(data, analysis, accountId, now) {
  const headerSignature = buildCsvHeaderSignature(analysis.headers || []);
  if (!headerSignature) return;

  const existing = (data.csvColumnMappings || []).find(mapping => mapping.headerSignature === headerSignature);
  const baseMapping = {
    name: existing?.name || inferCsvMappingName(analysis.fileName),
    fileName: analysis.fileName || existing?.fileName || "CSV import",
    accountId: accountId || existing?.accountId || "",
    headerSignature,
    headers: analysis.headers || [],
    columnMap: analysis.columnMap || {},
    lastUsedAt: now
  };

  if (existing) {
    data.csvColumnMappings = (data.csvColumnMappings || []).map(mapping => (
      mapping.id === existing.id
        ? { ...mapping, ...baseMapping, useCount: Number(mapping.useCount || 0) + 1 }
        : mapping
    ));
    return;
  }

  data.csvColumnMappings = [
    {
      id: createId("csv_map"),
      ...baseMapping,
      createdAt: now,
      useCount: 1
    },
    ...(data.csvColumnMappings || [])
  ];
}

function inferCsvMappingName(fileName) {
  const clean = String(fileName || "CSV format")
    .replace(/\.csv$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return clean || "CSV format";
}

function findHeader(headers, candidates) {
  const normalisedHeaders = headers.map(header => ({ original: header, normalised: normaliseText(header) }));

  for (const candidate of candidates) {
    const exact = normalisedHeaders.find(header => header.normalised === candidate);
    if (exact) return exact.original;
  }

  for (const candidate of candidates) {
    const loose = normalisedHeaders.find(header => header.normalised.includes(candidate));
    if (loose) return loose.original;
  }

  return "";
}

function getCell(row, header) {
  if (!header) return "";
  return row?.[header] ?? "";
}

function parseAmountFromRow(row, columnMap) {
  const paidIn = columnMap.paidIn ? parseMoney(getCell(row, columnMap.paidIn)) : null;
  const paidOut = columnMap.paidOut ? parseMoney(getCell(row, columnMap.paidOut)) : null;

  if (paidIn !== null || paidOut !== null) {
    const inValue = paidIn || 0;
    const outValue = paidOut || 0;
    return { amount: roundMoney(inValue - outValue), mode: "in_out" };
  }

  const amount = columnMap.amount ? parseMoney(getCell(row, columnMap.amount)) : null;
  return { amount: amount === null ? null : roundMoney(amount), mode: "signed" };
}

function parseMoney(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const negativeByBrackets = /^\(.*\)$/.test(text);
  const cleaned = text
    .replace(/[£$€]/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/[()]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negativeByBrackets ? -Math.abs(parsed) : parsed;
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const uk = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (uk) {
    const day = uk[1].padStart(2, "0");
    const month = uk[2].padStart(2, "0");
    const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${year}-${month}-${day}`;
  }

  const namedMonth = text.match(/^(\d{1,2})[-\s]([a-zA-Z]{3,})[-\s](\d{2,4})/);
  if (namedMonth) {
    const months = {
      jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
      apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
      aug: "08", august: "08", sep: "09", sept: "09", september: "09", oct: "10", october: "10",
      nov: "11", november: "11", dec: "12", december: "12"
    };
    const day = namedMonth[1].padStart(2, "0");
    const month = months[namedMonth[2].toLowerCase()];
    const year = namedMonth[3].length === 2 ? `20${namedMonth[3]}` : namedMonth[3];
    if (month) return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatIsoDateLocal(parsed);
}

function parseTime(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  // Not anchored to the start: a dedicated Time column always has the time
  // right at the start anyway, so this is unchanged for that case — but it
  // also lets the same parser pull a time out of a combined date+time value
  // like "2026-06-02 13:29:00" (e.g. Revolut's "Completed Date" column),
  // rather than only ever reading a time from its own separate column.
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Shared with ImportPage's cross-file transfer pairing (which compares two
// fresh CSV rows from different statements against each other) so that both
// places use the exact same evidence bar for calling two rows "the same
// transfer" instead of drifting apart. Same amount + close date alone is not
// evidence — it also matches two unrelated transactions that happen to share
// a common amount — so this is what actually decides "confirmed" vs "guess".
export function describeTextMatch(descriptionA, descriptionB) {
  const textA = normaliseText(descriptionA);
  const textB = normaliseText(descriptionB);
  const exactText = Boolean(textA) && Boolean(textB) && (textA === textB || textA.includes(textB) || textB.includes(textA));
  const similarity = textA && textB ? getTextSimilarity(textA, textB) : 0;
  return { exactText, similarity };
}

// Combines the per-file preview rows from analyseCsvImport() into one review
// list for a multi-statement import, pairing likely cross-file transfers
// (same amount, opposite sign, different account, close in time) before the
// user sees anything. Each analysis needs a `fileId` and `accountId` set on
// it (analyseImport() in ImportPage.jsx adds these before calling in).
// True only when both rows carry a real captured time (not the noon default
// minutesBetween falls back to when a row has none) and they land within
// minutes of each other. Guards against a same-date-but-timeless coincidence
// looking artificially "tight" just because both sides defaulted to noon.
function hasCorroboratedTiming(pair) {
  return Boolean(pair.a.time) && Boolean(pair.b.time) && pair.gapMinutes <= 10;
}

export function combineCsvAnalyses(analyses) {
  const combinedRows = [];
  analyses.forEach(fileAnalysis => {
    fileAnalysis.rows.forEach(row => {
      combinedRows.push({
        ...row,
        id: analyses.length > 1 ? `${fileAnalysis.fileId}__${row.id}` : row.id,
        fileId: fileAnalysis.fileId,
        sourceRowId: row.id,
        sourceFileName: fileAnalysis.fileName,
        sourceAccountId: fileAnalysis.accountId
      });
    });
  });

  // Score every plausible opposite-sign, different-account pair by how close
  // together (in time, using the Time column when it's mapped) they
  // happened, then accept the closest, best-evidenced pairs first. A naive
  // "first match found" loop mis-pairs money that hops through more than one
  // account close together (pay -> account A -> account B -> account C);
  // scoring every candidate pair up front copes with that far better.
  const pairablePool = combinedRows.filter(row => (
    row.date
    && Number.isFinite(Number(row.signedAmount))
    && row.action !== "duplicate"
    && row.action !== "match_planned"
    // Rows already linked to a real, already-saved transaction (via the
    // single-file matching above) are excluded — they're already handled.
    // A row merely *guessed* to be a transfer by its wording (action
    // "new_transfer", no confirmed match yet) must stay eligible here,
    // since that guess is exactly what cross-file pairing is meant to
    // confirm or correct.
    && row.action !== "match_existing_transfer"
  ));

  const candidatePairs = [];
  for (let i = 0; i < pairablePool.length; i += 1) {
    for (let j = i + 1; j < pairablePool.length; j += 1) {
      const a = pairablePool[i];
      const b = pairablePool[j];
      if (a.sourceAccountId === b.sourceAccountId) continue;
      if (Math.abs(Number(a.signedAmount) + Number(b.signedAmount)) > 0.005) continue;
      const gapMinutes = minutesBetween(a.date, a.time, b.date, b.time);
      if (gapMinutes > 3 * 24 * 60) continue;
      candidatePairs.push({ a, b, gapMinutes, ...describeTextMatch(a.description, b.description) });
    }
  }
  // Prefer pairs with actual wording evidence over same-amount coincidences,
  // then break ties by closeness in time — a coincidental same-amount pair
  // must never steal a row from a pair that genuinely shares wording.
  candidatePairs.sort((first, second) => {
    const firstScore = first.exactText || hasCorroboratedTiming(first) ? 2 : first.similarity >= 0.25 ? 1 : 0;
    const secondScore = second.exactText || hasCorroboratedTiming(second) ? 2 : second.similarity >= 0.25 ? 1 : 0;
    if (firstScore !== secondScore) return secondScore - firstScore;
    return first.gapMinutes - second.gapMinutes;
  });

  const matchedRowIds = new Set();
  candidatePairs.forEach(pair => {
    const { a, b, gapMinutes, exactText, similarity } = pair;
    if (matchedRowIds.has(a.id) || matchedRowIds.has(b.id)) return;
    matchedRowIds.add(a.id);
    matchedRowIds.add(b.id);

    const describeWhen = row => row.time ? `${row.date} ${row.time}` : row.date;
    // Same amount, opposite sign, and close together in time is not on its
    // own evidence that two rows from different accounts are the same
    // transfer — it also matches two completely unrelated transactions that
    // happen to share a common amount (rent, a subscription, a round
    // number). But when *both* sides actually carry a real timestamp (not
    // the noon default minutesBetween falls back to when a row has none)
    // and they land within minutes of each other, that is strong evidence
    // on its own: banks that timestamp both legs of their own internal
    // transfers do so identically, even when the two legs' descriptions are
    // generic and share no wording at all (e.g. "From Uni" / "To
    // Archibald's Account"). Otherwise, only auto-include when the wording
    // actually overlaps; if neither signal is there, still show the
    // possible pairing, but require the user to confirm it so an unrelated
    // expense/income pair is never silently merged into a phantom transfer.
    const hasEvidence = exactText || similarity >= 0.25 || hasCorroboratedTiming(pair);

    a.type = "transfer";
    a.action = "new_transfer";
    a.actionLabel = "Cross-file transfer";
    a.linkedAccountId = b.sourceAccountId;
    a.defaultInclude = hasEvidence;
    a.warning = hasEvidence
      ? `Likely transfer matched with ${b.sourceFileName} (${describeWhen(b)}, ${formatAmountForNote(b.amount)} opposite sign).`
      : `Unconfirmed possible transfer: same amount as a row in ${b.sourceFileName} (${describeWhen(b)}), but the descriptions don't match — could be a coincidence. Review before importing — not auto-selected.`;
    a.confidence = hasEvidence ? (gapMinutes <= 60 ? "High" : "Medium") : "Needs review";

    b.type = "transfer";
    b.action = "new_transfer";
    b.actionLabel = "Cross-file transfer";
    b.linkedAccountId = a.sourceAccountId;
    b.defaultInclude = hasEvidence;
    b.warning = hasEvidence
      ? `Likely transfer matched with ${a.sourceFileName} (${describeWhen(a)}, ${formatAmountForNote(a.amount)} opposite sign).`
      : `Unconfirmed possible transfer: same amount as a row in ${a.sourceFileName} (${describeWhen(a)}), but the descriptions don't match — could be a coincidence. Review before importing — not auto-selected.`;
    b.confidence = hasEvidence ? (gapMinutes <= 60 ? "High" : "Medium") : "Needs review";

    a.crossFileMatchId = b.id;
    b.crossFileMatchId = a.id;
  });

  combinedRows.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "") || a.sourceFileName.localeCompare(b.sourceFileName) || a.rowIndex - b.rowIndex);

  // Keep matched pairs sitting right next to each other in the review list
  // (even though each side comes from a different file) so they can be shown
  // visually linked, rather than possibly landing rows apart once sorted.
  const orderedRows = [];
  const placedRowIds = new Set();
  const rowsById = new Map(combinedRows.map(row => [row.id, row]));
  combinedRows.forEach(row => {
    if (placedRowIds.has(row.id)) return;
    orderedRows.push(row);
    placedRowIds.add(row.id);
    const pair = row.crossFileMatchId ? rowsById.get(row.crossFileMatchId) : null;
    if (pair && !placedRowIds.has(pair.id)) {
      orderedRows.push(pair);
      placedRowIds.add(pair.id);
    }
  });

  return orderedRows;
}

// Applies a multi-file import, one statement at a time, in upload order.
// Before each file is applied, its analysis is re-run fresh against the
// transactions already created by earlier files in this same import — this
// is what turns an opposite-sign pair from two CSVs into one merged
// transfer instead of two one-sided ones.
//
// `combinedRows` is the combineCsvAnalyses() output the user reviewed
// (carries each row's preview-time linkedAccountId/crossFileMatchId, worked
// out by comparing every file at once). `rowEditsByCombinedId` is keyed by
// combinedRows' `${fileId}__${rowId}` ids. `validFileIds`, if given, skips
// any analysis entry whose fileId isn't in the set (mirrors the UI's guard
// against a file having been removed from the upload list).
export function applyMultiCsvImport(appData, analyses, combinedRows, rowEditsByCombinedId, validFileIds) {
  let workingData = appData;
  const aggregate = { importedTransactionIds: [], linkedTransactionIds: [], skippedRows: [], batches: [] };

  for (const fileAnalysis of analyses) {
    if (validFileIds && !validFileIds.has(fileAnalysis.fileId)) continue;

    const refreshed = analyseCsvImport(workingData, {
      accountId: fileAnalysis.accountId,
      fileName: fileAnalysis.fileName,
      headers: fileAnalysis.headers,
      rows: fileAnalysis.rows.map(row => row.raw),
      columnMap: fileAnalysis.columnMap
    });

    const edits = {};
    refreshed.rows.forEach(row => {
      const combinedId = `${fileAnalysis.fileId}__${row.id}`;
      const originalEdit = rowEditsByCombinedId[combinedId] || {};
      edits[row.id] = { ...originalEdit };

      // Preserve the user's cross-file transfer/account decision when possible.
      const previewCombined = combinedRows.find(item => item.id === combinedId);
      if (previewCombined?.linkedAccountId && !edits[row.id].linkedAccountId) {
        edits[row.id].linkedAccountId = previewCombined.linkedAccountId;
      }
      if (previewCombined?.type === "transfer" && !edits[row.id].type) {
        edits[row.id].type = "transfer";
      }

      // Files are applied one at a time. When the preview was first built,
      // neither side of a cross-file transfer existed yet, so both rows
      // were only ever marked "create a new transfer". By the time a later
      // file is actually applied, the earlier file's half may now really
      // exist in the data — and this fresh re-analysis just found it. If we
      // don't switch to linking against it here, this row goes on to create
      // its *own* separate transfer instead of completing the existing
      // one, and the amount gets double-counted in both accounts' balances.
      // Only do this while the row is still on its untouched default guess,
      // so an explicit user choice (e.g. after using "Not this match") is
      // always respected.
      //
      // But only trust the fresh match when it agrees with what the
      // combined preview already worked out. The fresh re-analysis only
      // sees this one file in isolation, with no memory of the rules
      // learned from this same file's own earlier rows (those are only
      // applied progressively, row by row, as this loop runs) — so a
      // generic recurring description (e.g. the account holder's own name
      // used for more than one real payment) can resolve to whichever
      // same-amount transfer happens to already exist at that moment, even
      // when the combined preview had already correctly resolved this exact
      // row to a different account using stronger evidence (shared wording
      // across every file at once, or matching timestamps). Only accept the
      // fresh match when there was no preview guidance at all, or the two
      // agree.
      const previewLinkedAccountId = previewCombined?.linkedAccountId || null;
      const freshMatchAgreesWithPreview = !previewLinkedAccountId || row.linkedAccountId === previewLinkedAccountId;
      if (edits[row.id].action === "new_transfer" && row.action === "match_existing_transfer" && row.matchTransactionId && freshMatchAgreesWithPreview) {
        edits[row.id].action = "match_existing_transfer";
        edits[row.id].type = "transfer";
        edits[row.id].matchTransactionId = row.matchTransactionId;
        if (!edits[row.id].linkedAccountId) edits[row.id].linkedAccountId = row.linkedAccountId;
      }
    });

    const missingTransfer = refreshed.rows.some(row => {
      const edit = edits[row.id] || {};
      const include = edit.include ?? row.defaultInclude;
      const type = edit.type || row.type;
      const action = edit.action || row.action;
      const linkedAccountId = edit.linkedAccountId || row.linkedAccountId;
      return include && type === "transfer" && action !== "match_existing_transfer" && !linkedAccountId;
    });
    if (missingTransfer) {
      return { data: workingData, result: aggregate, missingTransferFileName: fileAnalysis.fileName };
    }

    const result = applyCsvImport(workingData, refreshed, edits, { createReconciliationAdjustment: false });
    workingData = result.data;
    aggregate.importedTransactionIds.push(...result.result.importedTransactionIds);
    aggregate.linkedTransactionIds.push(...result.result.linkedTransactionIds);
    aggregate.skippedRows.push(...result.result.skippedRows);
    aggregate.batches.push(result.result.importBatch);
  }

  return { data: workingData, result: aggregate, missingTransferFileName: null };
}

function normaliseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isLikelyTransferDescription(description) {
  const text = normaliseText(description);
  return TRANSFER_WORDS.some(word => text.includes(word));
}

function findExternalAccountMatch(mappings, description) {
  const text = normaliseText(description);
  return mappings.find(mapping => {
    const external = normaliseText(mapping.externalName);
    if (!external) return false;
    // Word-boundary match, not a raw substring check — otherwise a short
    // external name like "A" would match inside an unrelated word (e.g.
    // hidden inside "trAnsfer"), producing a bogus account link.
    return new RegExp(`(^|\\s)${escapeRegExp(external)}(\\s|$)`).test(text);
  }) || null;
}

function findTransferRule(rules, uploadedAccountId, description) {
  const text = normaliseText(description);
  return rules.find(rule => {
    const match = normaliseText(rule.matchText);
    return rule.uploadedAccountId === uploadedAccountId && match && text.includes(match);
  }) || null;
}

function extractExternalAccountName(description, accounts, mappedExternalAccount) {
  if (mappedExternalAccount?.externalName) return mappedExternalAccount.externalName;

  const text = String(description || "");
  // Apostrophes must be in the capture set — a bank description like "To
  // Archibald's Account" would otherwise get truncated at the apostrophe,
  // extracting just "Archibald" as the "external account name". That gets
  // learned as a *global* rule (external-account mappings aren't scoped to
  // one uploading account, unlike transfer rules), so any bare first name
  // ends up silently matching every other statement that mentions the same
  // person — hijacking real transfer matches for completely unrelated
  // accounts and rows.
  const fromToMatch = text.match(/(?:from|to)\s+([a-z0-9\s\-_.']{3,45})/i);
  const candidate = fromToMatch ? fromToMatch[1].trim().replace(/\s+/g, " ") : "";
  // Even with apostrophes allowed, defensively refuse a single bare word —
  // it's too generic to safely learn as a rule that applies across every
  // account (a first name, "transfer", "payment", etc. would all falsely
  // match unrelated rows). Require at least two words of real signal.
  if (candidate.includes(" ")) return candidate;

  // Word-boundary match only — a plain substring check would let a short
  // account name like "A" or "ISA" match inside unrelated words (e.g. "A"
  // inside "TRANSFER", or "ISA" inside "VISA"), producing a nonsensical
  // external-account mapping.
  const normalisedText = normaliseText(text);
  const account = accounts.find(item => {
    if (!item.name) return false;
    const normalisedName = normaliseText(item.name);
    if (!normalisedName) return false;
    return new RegExp(`(^|\\s)${escapeRegExp(normalisedName)}(\\s|$)`).test(normalisedText);
  });
  return account?.name || "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Built once per CSV import (not once per row). Every finder below used to
// re-scan the entire transaction history from scratch for every single CSV
// row — 4 full linear scans per row, so a several-hundred-row statement
// against a few years of history meant millions of comparisons on the main
// thread. The exact-tolerance finders (duplicate / existing transfer /
// opposite-sign match) all require the amount to match to the nearest
// penny (<=0.005 difference), so bucketing candidates by rounded absolute
// amount up front is lossless — anything outside a row's bucket could never
// have passed that tolerance check anyway.
function buildTransactionMatchIndex(transactions, accounts) {
  const list = Array.isArray(transactions) ? transactions : [];
  const accountsById = new Map((accounts || []).map(account => [account.id, account]));
  const sourceRowHashIndex = new Map();
  const amountIndex = new Map();
  const plannedCandidates = [];

  list.forEach(transaction => {
    (transaction.matchedBankRows || []).forEach(row => {
      if (row?.sourceRowHash && !sourceRowHashIndex.has(row.sourceRowHash)) {
        sourceRowHashIndex.set(row.sourceRowHash, transaction);
      }
    });

    const amountKey = roundMoney(Math.abs(Number(transaction.amount || 0)));
    if (!amountIndex.has(amountKey)) amountIndex.set(amountKey, []);
    amountIndex.get(amountKey).push(transaction);

    if ((transaction.matchedBankRows || []).length === 0 && transaction.status !== "imported" && transaction.importSource !== "csv") {
      plannedCandidates.push(transaction);
    }
  });

  return { sourceRowHashIndex, amountIndex, plannedCandidates, accountsById };
}

function getAmountCandidates(matchIndex, amount) {
  return matchIndex.amountIndex.get(roundMoney(Math.abs(Number(amount || 0)))) || [];
}

function findExistingImportedRow(matchIndex, sourceRowHash, accountId, date, time, signedAmount, description) {
  const directMatch = matchIndex.sourceRowHashIndex.get(sourceRowHash);
  if (directMatch) return directMatch;

  const text = normaliseText(description);
  const candidates = getAmountCandidates(matchIndex, signedAmount)
    .filter(transaction => {
      const touchesAccount = transactionTouchesAccount(transaction, accountId);
      // A one-day tolerance instead of an exact match: the same transaction can
      // carry a slightly different posted/value date across overlapping bank
      // statement exports, and treating that shift as "not a duplicate" is what
      // lets it get imported a second time, double-counting the amount.
      if (!touchesAccount || daysBetween(transaction.date, date) > 1) return false;

      const txnSignedAmount = getSignedAmountForAccount(transaction, accountId);
      if (Math.abs(txnSignedAmount - signedAmount) > 0.005) return false;

      const transactionText = normaliseText(`${transaction.title || ""} ${transaction.note || ""}`);
      return transactionText.includes(text.slice(0, 14)) || text.includes(transactionText.slice(0, 14));
    })
    .map(transaction => {
      // With more than one candidate in range (e.g. two same-amount payments
      // a day apart), pick whichever is actually closest — same day beats
      // adjacent day, and matching time-of-day (when both sides have one)
      // beats a same-day match with no time evidence either way.
      const transactionTime = transaction.matchedBankRows?.[0]?.time || null;
      const dateScore = Math.max(0, 10 - daysBetween(transaction.date, date) * 10);
      const timeScore = time && transactionTime
        ? Math.max(0, 5 - minutesBetween(transaction.date, transactionTime, date, time) / 120)
        : 0;
      return { transaction, score: dateScore + timeScore };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.transaction || null;
}

function findOppositeSignAccountMatch(matchIndex, uploadedAccountId, date, time, signedAmount, description) {
  const amount = Math.abs(Number(signedAmount || 0));
  const text = normaliseText(description);
  if (!uploadedAccountId || !amount || !text) return null;

  const candidates = getAmountCandidates(matchIndex, amount)
    .filter(transaction => {
      if (!transaction || transaction.type === "transfer") return false;
      if (transaction.accountId === uploadedAccountId) return false;
      if (daysBetween(transaction.date, date) > 3) return false;
      return true;
    })
    .map(transaction => {
      const candidateText = normaliseText(`${transaction.title || ""} ${transaction.note || ""}`);
      const similarity = getTextSimilarity(candidateText, text);
      const exactText = candidateText === text || candidateText.includes(text) || text.includes(candidateText);
      const opposite = getSignedAmountForAccount(transaction, transaction.accountId) * signedAmount < 0;
      // Only the presence of shared wording (e.g. the same person's name on
      // both sides) is a real signal that this is genuinely the same
      // transfer. Checking whether *either* description merely contains a
      // generic word like "transfer" is far too weak on its own — bank CSVs
      // say things like "TRANSFER TO SAVINGS" constantly, and on its own
      // that would match this row to any unrelated same-amount transaction
      // in another account that happens to land on a nearby date (e.g. an
      // unrelated salary payment sharing a round amount).
      const transferSignal = exactText || similarity >= 0.25;
      if (!opposite || !transferSignal) return null;
      const transactionTime = transaction.matchedBankRows?.[0]?.time || null;
      const timeBonus = time && transactionTime
        ? Math.max(0, 10 - minutesBetween(transaction.date, transactionTime, date, time) / 60)
        : 0;
      return {
        ...transaction,
        matchKind: "opposite_sign_account",
        accountName: (matchIndex.accountsById.get(transaction.accountId))?.name || "Another account",
        exactText,
        matchScore: (exactText ? 70 : 0) + similarity * 30 + Math.max(0, 10 - daysBetween(transaction.date, date) * 3) + timeBonus
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.matchScore - a.matchScore);

  return candidates[0] || null;
}

function findExistingTransferMatch(matchIndex, uploadedAccountId, linkedAccountId, date, time, signedAmount) {
  const amount = Math.abs(signedAmount);
  const isMoneyIntoUploaded = signedAmount > 0;

  const candidates = getAmountCandidates(matchIndex, amount)
    .filter(transaction => {
      if (transaction.type !== "transfer") return false;
      // A transfer only ever has two real legs. Once both sides are already
      // present (status "matched"), it must never accept a third bank row —
      // otherwise an unrelated same-amount, nearby-date transfer (e.g. an
      // internal savings-pot move that happens to also be, say, £1500 a day
      // later) gets silently absorbed into an already-complete transfer,
      // vanishing from the ledger instead of becoming its own transaction.
      if (transaction.status === "matched") return false;
      if (daysBetween(transaction.date, date) > 3) return false;

      if (linkedAccountId) {
        return isMoneyIntoUploaded
          ? transaction.toAccountId === uploadedAccountId && transaction.fromAccountId === linkedAccountId
          : transaction.fromAccountId === uploadedAccountId && transaction.toAccountId === linkedAccountId;
      }

      return isMoneyIntoUploaded
        ? transaction.toAccountId === uploadedAccountId
        : transaction.fromAccountId === uploadedAccountId;
    })
    .map(transaction => {
      const transactionTime = transaction.matchedBankRows?.[0]?.time || null;
      // When several similar transfers are close together (e.g. money hopping
      // through more than one account), pick whichever candidate is actually
      // closest in time rather than just the first one found.
      const gapMinutes = minutesBetween(transaction.date, transactionTime, date, time);
      return { transaction, gapMinutes };
    })
    .sort((a, b) => a.gapMinutes - b.gapMinutes);

  return candidates[0]?.transaction || null;
}

function findPlannedMatch(data, matchIndex, accountId, date, signedAmount, description, likelyTransfer) {
  const amount = Math.abs(signedAmount);
  const baseType = signedAmount >= 0 ? "income" : "expense";
  const text = normaliseText(description);

  // Planned/recurring items are usually a small slice of all transactions, so
  // this pre-filtered pool (built once per import, not per row) is far
  // smaller than the full transaction history — the eligibility checks here
  // don't depend on the row, only the row-specific checks below do.
  const candidates = matchIndex.plannedCandidates
    .filter(transaction => {
      if (likelyTransfer && transaction.type !== "transfer") return false;
      if (!likelyTransfer && transaction.type !== baseType) return false;
      if (!transactionTouchesAccount(transaction, accountId)) return false;
      if (daysBetween(transaction.date, date) > getDateTolerance(transaction, baseType)) return false;
      const amountDiff = Math.abs(Number(transaction.amount || 0) - amount);
      const relativeDiff = amount > 0 ? amountDiff / amount : 1;
      return amountDiff <= 0.01 || amountDiff <= 2 || relativeDiff <= 0.08;
    })
    .map(transaction => {
      const amountDifference = roundMoney(amount - Number(transaction.amount || 0));
      const titleText = normaliseText(`${transaction.title || ""} ${getCategoryName(data, transaction.categoryId)}`);
      const similarity = titleText && text ? getTextSimilarity(titleText, text) : 0;
      const exactAmount = Math.abs(amountDifference) <= 0.01;
      const dateDistance = daysBetween(transaction.date, date);
      const score = (exactAmount ? 45 : 25) + Math.max(0, 25 - dateDistance * 5) + similarity * 30;
      return { ...transaction, amountDifference, matchScore: score };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  return candidates[0] || null;
}

function suggestCategoryId(data, type, description, importRules) {
  const text = normaliseText(description);
  const rule = importRules.find(item => item.transactionType === type && text.includes(normaliseText(item.matchText)));
  if (rule?.categoryId && categoryExists(data, rule.categoryId, type)) return rule.categoryId;

  const keywordMatch = CATEGORY_KEYWORDS.find(item => item.words.some(word => text.includes(word)) && categoryExists(data, item.categoryId, type));
  if (keywordMatch) return keywordMatch.categoryId;

  return getFallbackCategoryId(data, type);
}

function getFallbackCategoryId(data, type) {
  const fallbackId = type === "income" ? "cat_other_income" : "cat_everything_else";
  if (categoryExists(data, fallbackId, type)) return fallbackId;
  return (data.categories || []).find(category => category.type === type && category.isActive !== false)?.id || "";
}

function categoryExists(data, categoryId, type) {
  return (data.categories || []).some(category => category.id === categoryId && category.type === type && category.isActive !== false);
}

function getCategoryName(data, categoryId) {
  return (data.categories || []).find(category => category.id === categoryId)?.name || "";
}

function getAccountName(data, accountId) {
  return (data.accounts || []).find(account => account.id === accountId)?.name || "the linked account";
}

function createSourceRowHash({ accountId, date, amount, description }) {
  return normaliseText(`${accountId}|${date}|${roundMoney(amount)}|${description}`);
}

function transactionTouchesAccount(transaction, accountId) {
  if (!transaction || !accountId) return false;
  if (transaction.type === "transfer") return transaction.fromAccountId === accountId || transaction.toAccountId === accountId;
  return transaction.accountId === accountId;
}

function getSignedAmountForAccount(transaction, accountId) {
  if (transaction.type === "income" && transaction.accountId === accountId) return Number(transaction.amount || 0);
  if (transaction.type === "expense" && transaction.accountId === accountId) return -Number(transaction.amount || 0);
  if (transaction.type === "transfer") {
    if (transaction.toAccountId === accountId) return Number(transaction.amount || 0);
    if (transaction.fromAccountId === accountId) return -Number(transaction.amount || 0);
  }
  return 0;
}

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 999;
  return Math.abs(Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24)));
}

function minutesBetween(dateA, timeA, dateB, timeB) {
  const a = new Date(`${dateA}T${timeA || "12:00"}:00`);
  const b = new Date(`${dateB}T${timeB || "12:00"}:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Infinity;
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

export { minutesBetween };

function getDateTolerance(transaction, type) {
  const title = normaliseText(transaction.title || "");
  if (type === "income" || title.includes("wage") || title.includes("salary") || title.includes("loan")) return 5;
  return 3;
}

function getTextSimilarity(a, b) {
  const aWords = new Set(a.split(" ").filter(word => word.length > 2));
  const bWords = new Set(b.split(" ").filter(word => word.length > 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let shared = 0;
  aWords.forEach(word => {
    if (bWords.has(word)) shared += 1;
  });
  return shared / Math.max(aWords.size, bWords.size);
}

function getRulePhrase(description) {
  const text = normaliseText(description);
  const words = text.split(" ").filter(word => !/^\d+$/.test(word));
  return words.slice(0, 5).join(" ").trim();
}

function cleanTitle(description) {
  const title = String(description || "Imported transaction").trim().replace(/\s+/g, " ");
  return title.length > 64 ? `${title.slice(0, 61)}...` : title;
}

function getConfidenceLabel(action, plannedMatch, transferMatch) {
  if (action === "duplicate") return "High";
  if (transferMatch?.matchKind === "opposite_sign_account") return transferMatch.exactText ? "High" : "Needs review";
  if (transferMatch) return "High";
  if (plannedMatch?.matchScore >= 75) return "High";
  if (plannedMatch) return "Medium";
  if (action === "new_transfer") return "Needs review";
  return "Auto";
}

function summarisePreviewRows(rows) {
  return rows.reduce((totals, row) => {
    totals.total += 1;
    totals.defaultIncluded += row.defaultInclude ? 1 : 0;
    totals.duplicates += row.action === "duplicate" ? 1 : 0;
    totals.transfers += row.type === "transfer" ? 1 : 0;
    totals.plannedMatches += row.action === "match_planned" ? 1 : 0;
    totals.existingTransferMatches += row.action === "match_existing_transfer" ? 1 : 0;
    totals.newRows += row.action === "new" || row.action === "new_transfer" ? 1 : 0;
    totals.needsReview += row.warning || row.confidence === "Needs review" ? 1 : 0;
    totals.largeExpenses += row.suggestedExcludeFromBudget ? 1 : 0;
    return totals;
  }, {
    total: 0,
    defaultIncluded: 0,
    duplicates: 0,
    transfers: 0,
    plannedMatches: 0,
    existingTransferMatches: 0,
    newRows: 0,
    needsReview: 0,
    largeExpenses: 0
  });
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatAmountForNote(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}
