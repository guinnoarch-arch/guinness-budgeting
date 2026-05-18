import { createId } from "../utils/ids.js";
import { calculateAccountBalanceAtDate } from "../utils/calculations.js";

const DATE_CANDIDATES = ["date", "transaction date", "posted date", "booking date", "value date"];
const DESCRIPTION_CANDIDATES = ["description", "transaction description", "transaction details", "transaction narrative", "transaction 2", "details", "narrative", "merchant", "name", "reference", "payee", "memo"];
const AMOUNT_CANDIDATES = ["amount", "transaction amount", "value", "paid", "money in/out", "money in out"];
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
    description: findHeader(headers, DESCRIPTION_CANDIDATES),
    amount: findHeader(headers, AMOUNT_CANDIDATES),
    paidIn: findHeader(headers, PAID_IN_CANDIDATES),
    paidOut: findHeader(headers, PAID_OUT_CANDIDATES),
    balance: findHeader(headers, BALANCE_CANDIDATES)
  };
}

export function analyseCsvImport(data, { accountId, fileName, headers, rows, columnMap }) {
  const now = new Date().toISOString();
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalisedMappings = data.externalAccountMappings || [];
  const transferRules = data.transferRules || [];
  const importRules = data.importRules || [];

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
      now
    }))
    .filter(Boolean);

  const csvBalanceRows = previewRows.filter(row => row.balance !== null && row.balance !== undefined && row.date);
  const latestBalanceRow = csvBalanceRows.length > 0
    ? [...csvBalanceRows].sort((a, b) => a.date.localeCompare(b.date) || a.rowIndex - b.rowIndex).at(-1)
    : null;

  const latestCsvDate = previewRows
    .filter(row => row.date)
    .map(row => row.date)
    .sort()
    .at(-1) || null;

  const today = new Date().toISOString().slice(0, 10);
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
    reconciliation
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
    externalAccountMappings: [...(data.externalAccountMappings || [])]
  };

  const importedTransactionIds = [];
  const linkedTransactionIds = [];
  const skippedRows = [];

  analysis.rows.forEach(previewRow => {
    const edit = rowEdits[previewRow.id] || {};
    const include = edit.include ?? previewRow.defaultInclude;
    if (!include) {
      skippedRows.push({ rowIndex: previewRow.rowIndex, reason: "not_selected" });
      return;
    }

    const rowAction = edit.action || previewRow.action;
    const finalType = edit.type || previewRow.type;
    const finalCategoryId = finalType === "transfer" ? null : (edit.categoryId || previewRow.categoryId || getFallbackCategoryId(nextData, finalType));
    const linkedAccountId = edit.linkedAccountId || previewRow.linkedAccountId || null;
    const matchTransactionId = edit.matchTransactionId || previewRow.matchTransactionId || null;

    const bankRow = buildMatchedBankRow(previewRow, importBatchId, accountId);

    if (rowAction === "duplicate") {
      skippedRows.push({ rowIndex: previewRow.rowIndex, reason: "duplicate" });
      return;
    }

    if (rowAction === "match_existing_transfer" && matchTransactionId) {
      nextData.transactions = nextData.transactions.map(transaction => {
        if (transaction.id !== matchTransactionId) return transaction;
        return mergeImportedTransaction(transaction, previewRow, bankRow, now, true);
      });
      linkedTransactionIds.push(matchTransactionId);
      rememberTransferMappings(nextData, previewRow, accountId, linkedAccountId, now);
      return;
    }

    if (rowAction === "match_planned" && matchTransactionId) {
      nextData.transactions = nextData.transactions.map(transaction => {
        if (transaction.id !== matchTransactionId) return transaction;
        return mergeImportedTransaction(transaction, previewRow, bankRow, now, false);
      });
      linkedTransactionIds.push(matchTransactionId);
      rememberCategoryRule(nextData, previewRow, finalCategoryId, finalType, now);
      return;
    }

    if (finalType === "transfer") {
      if (!linkedAccountId || linkedAccountId === accountId) {
        skippedRows.push({ rowIndex: previewRow.rowIndex, reason: "transfer_missing_other_account" });
        return;
      }

      const transfer = buildTransferTransaction(previewRow, accountId, linkedAccountId, bankRow, now);
      nextData.transactions = [transfer, ...nextData.transactions];
      importedTransactionIds.push(transfer.id);
      rememberTransferMappings(nextData, previewRow, accountId, linkedAccountId, now);
      return;
    }

    const transaction = buildStandardTransaction(previewRow, accountId, finalType, finalCategoryId, bankRow, now);
    nextData.transactions = [transaction, ...nextData.transactions];
    importedTransactionIds.push(transaction.id);
    rememberCategoryRule(nextData, previewRow, finalCategoryId, finalType, now);
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
    columnMap: analysis.columnMap
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

function buildPreviewRow({ data, row, rowIndex, accountId, columnMap, normalisedMappings, transferRules, importRules }) {
  const rawDate = getCell(row, columnMap.date);
  const rawDescription = getCell(row, columnMap.description);
  const description = rawDescription || `CSV row ${rowIndex + 2}`;
  const date = parseDate(rawDate);
  const amountInfo = parseAmountFromRow(row, columnMap);
  const amount = amountInfo.amount;
  const balance = columnMap.balance ? parseMoney(getCell(row, columnMap.balance)) : null;

  if (!date || amount === null || amount === 0) return null;

  const signedAmount = amount;
  const absoluteAmount = Math.abs(signedAmount);
  const baseType = signedAmount >= 0 ? "income" : "expense";
  const normalisedDescription = normaliseText(description);
  const sourceRowHash = createSourceRowHash({ accountId, date, amount: signedAmount, description });

  const existingDuplicate = findExistingImportedRow(data, sourceRowHash, accountId, date, signedAmount, description);
  const mappedExternalAccount = findExternalAccountMatch(normalisedMappings, description);
  const transferRule = findTransferRule(transferRules, accountId, description);
  const likelyTransfer = Boolean(transferRule || mappedExternalAccount || isLikelyTransferDescription(description));
  const linkedAccountId = transferRule?.linkedAccountId || mappedExternalAccount?.gbAccountId || null;
  const existingTransferMatch = likelyTransfer
    ? findExistingTransferMatch(data, accountId, linkedAccountId, date, signedAmount)
    : null;
  const plannedMatch = !existingTransferMatch && !existingDuplicate
    ? findPlannedMatch(data, accountId, date, signedAmount, description, likelyTransfer)
    : null;

  const suggestedCategoryId = suggestCategoryId(data, baseType, description, importRules);
  const externalAccountName = extractExternalAccountName(description, data.accounts, mappedExternalAccount);

  let action = "new";
  let actionLabel = "New transaction";
  let type = baseType;
  let matchTransactionId = null;
  let defaultInclude = true;
  let warning = "";

  if (existingDuplicate) {
    action = "duplicate";
    actionLabel = "Already imported / duplicate";
    defaultInclude = false;
    warning = "This looks like an existing transaction. It is unticked by default.";
  } else if (existingTransferMatch) {
    action = "match_existing_transfer";
    actionLabel = "Link to existing transfer";
    type = "transfer";
    matchTransactionId = existingTransferMatch.id;
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
    defaultInclude = Boolean(linkedAccountId);
    warning = linkedAccountId ? "" : "Choose the other GB account before importing this transfer.";
  }

  return {
    id: `csv_row_${rowIndex}`,
    rowIndex,
    raw: row,
    sourceRowHash,
    date,
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
    externalAccountName,
    confidence: getConfidenceLabel(action, plannedMatch, existingTransferMatch),
    matchedTitle: plannedMatch?.title || existingTransferMatch?.title || null
  };
}

function buildStandardTransaction(previewRow, accountId, type, categoryId, bankRow, now) {
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

function mergeImportedTransaction(transaction, previewRow, bankRow, now, isTransferMatch) {
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
  return parsed.toISOString().slice(0, 10);
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
    return external && text.includes(external);
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
  const fromToMatch = text.match(/(?:from|to)\s+([a-z0-9\s\-_.]{3,45})/i);
  if (fromToMatch) return fromToMatch[1].trim().replace(/\s+/g, " ");

  const account = accounts.find(item => item.name && normaliseText(text).includes(normaliseText(item.name)));
  return account?.name || "";
}

function findExistingImportedRow(data, sourceRowHash, accountId, date, signedAmount, description) {
  const text = normaliseText(description);
  return (data.transactions || []).find(transaction => {
    const matchedRows = transaction.matchedBankRows || [];
    if (matchedRows.some(row => row.sourceRowHash === sourceRowHash)) return true;

    const touchesAccount = transactionTouchesAccount(transaction, accountId);
    if (!touchesAccount || transaction.date !== date) return false;

    const txnSignedAmount = getSignedAmountForAccount(transaction, accountId);
    if (Math.abs(txnSignedAmount - signedAmount) > 0.005) return false;

    const transactionText = normaliseText(`${transaction.title || ""} ${transaction.note || ""}`);
    return transactionText.includes(text.slice(0, 14)) || text.includes(transactionText.slice(0, 14));
  }) || null;
}

function findExistingTransferMatch(data, uploadedAccountId, linkedAccountId, date, signedAmount) {
  const amount = Math.abs(signedAmount);
  const isMoneyIntoUploaded = signedAmount > 0;

  return (data.transactions || []).find(transaction => {
    if (transaction.type !== "transfer") return false;
    if (Math.abs(Number(transaction.amount || 0) - amount) > 0.005) return false;
    if (daysBetween(transaction.date, date) > 3) return false;

    if (linkedAccountId) {
      return isMoneyIntoUploaded
        ? transaction.toAccountId === uploadedAccountId && transaction.fromAccountId === linkedAccountId
        : transaction.fromAccountId === uploadedAccountId && transaction.toAccountId === linkedAccountId;
    }

    return isMoneyIntoUploaded
      ? transaction.toAccountId === uploadedAccountId
      : transaction.fromAccountId === uploadedAccountId;
  }) || null;
}

function findPlannedMatch(data, accountId, date, signedAmount, description, likelyTransfer) {
  const amount = Math.abs(signedAmount);
  const baseType = signedAmount >= 0 ? "income" : "expense";
  const text = normaliseText(description);

  const candidates = (data.transactions || [])
    .filter(transaction => {
      if ((transaction.matchedBankRows || []).length > 0) return false;
      if (transaction.status === "imported" || transaction.importSource === "csv") return false;
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
  const fallbackId = type === "income" ? "cat_other_income" : "cat_other_expense";
  if (categoryExists(data, fallbackId, type)) return fallbackId;
  return (data.categories || []).find(category => category.type === type && category.isActive)?.id || "";
}

function categoryExists(data, categoryId, type) {
  return (data.categories || []).some(category => category.id === categoryId && category.type === type && category.isActive);
}

function getCategoryName(data, categoryId) {
  return (data.categories || []).find(category => category.id === categoryId)?.name || "";
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
  if (transferMatch) return "High";
  if (plannedMatch?.matchScore >= 75) return "High";
  if (plannedMatch) return "Medium";
  if (action === "needs_transfer_account") return "Needs review";
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
    totals.needsReview += row.warning ? 1 : 0;
    return totals;
  }, {
    total: 0,
    defaultIncluded: 0,
    duplicates: 0,
    transfers: 0,
    plannedMatches: 0,
    existingTransferMatches: 0,
    needsReview: 0
  });
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatAmountForNote(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}
