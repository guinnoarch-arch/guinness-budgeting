// Calculations for reviewing a CSV import before it's confirmed: row edits
// and filters, projected balances, diagnosis of balance gaps, and the
// combined summary across several statements. Nothing here saves data.
import { buildCsvBalanceTimeline, alignAccountToCsvTimeline } from "./csvImportService.js";
import { calculateAccountBalanceAtDate } from "../utils/calculations.js";
import { roundMoney } from "../utils/money.js";

const SPREADSHEET_EXTENSIONS = /\.(xlsx|xls|xlsm|numbers|ods)$/i;

// Returns why a chosen file can't be a CSV, or "" if it looks fine.
export function describeNonCsvFile(file) {
  const name = String(file?.name || "");
  if (SPREADSHEET_EXTENSIONS.test(name)) {
    return "This is a spreadsheet file, not a CSV. Open it and use Save As or Export to save it as .csv, or download the CSV version from your bank.";
  }
  if (/\.pdf$/i.test(name)) {
    return "This is a PDF statement. Download the CSV version from your bank's website or app instead.";
  }
  const looksLikeText = /\.(csv|txt)$/i.test(name) || /csv|text\/plain/i.test(file?.type || "");
  return looksLikeText ? "" : "This file isn't a CSV. Export your statement from your bank as .csv and try again.";
}

// Which required column or account is missing for an uploaded file.
export function describeMappingProblem(item) {
  const map = item.columnMap || {};
  if (!item.accountId) return "choose which account this statement is for.";
  if (!map.date) return "choose the column that holds the date.";
  if (!map.description) return "choose the column that holds the description.";
  if (!map.amount && !(map.paidIn && map.paidOut)) {
    return "choose either a single Amount column, or both a Paid in and a Paid out column.";
  }
  return "";
}

export function getRowEdit(rowEdits, row) {
  return rowEdits[row.id] || {};
}

function getEditedAction(row, rowEdits) {
  return getRowEdit(rowEdits, row).action || row.action;
}

function getEditedType(row, rowEdits) {
  return getRowEdit(rowEdits, row).type || row.type;
}

export function rowMatchesFilter(row, rowEdits, filter) {
  const action = getEditedAction(row, rowEdits);
  const type = getEditedType(row, rowEdits);

  if (filter === "all") return true;
  if (filter === "needs_review") return Boolean(row.warning) || row.confidence === "Needs review" || (type === "transfer" && action !== "match_existing_transfer" && !(getRowEdit(rowEdits, row).linkedAccountId || row.linkedAccountId));
  if (filter === "unticked") return !(getRowEdit(rowEdits, row).include ?? row.defaultInclude);
  if (filter === "duplicates") return action === "duplicate";
  if (filter === "transfers") return type === "transfer";
  if (filter === "matched") return action === "match_planned" || action === "match_existing_transfer";
  if (filter === "new") return action === "new" || action === "new_transfer";
  return true;
}

export function getFilterCount(rows, rowEdits, filter) {
  return rows.filter(row => rowMatchesFilter(row, rowEdits, filter)).length;
}

export function getProjectedBalanceAtDate(appData, analysis, rowEdits) {
  if (!analysis?.reconciliation?.available) return null;

  const cutoffDate = analysis.reconciliation.latestCsvDate;
  const accountId = analysis.accountId;
  let projected = calculateAccountBalanceAtDate(appData, accountId, cutoffDate);

  analysis.rows.forEach(row => {
    const edit = getRowEdit(rowEdits, row);
    const include = edit.include ?? row.defaultInclude;
    if (!include || !row.date || row.date > cutoffDate) return;

    const action = edit.action || row.action;
    const type = edit.type || row.type;
    const signedAmount = Number(edit.amount ?? row.amount) * (row.signedAmount < 0 ? -1 : 1);
    // Linking to an existing transfer still creates this account's own leg,
    // so it moves this account's balance like any new row.
    if (action === "duplicate") return;

    if (action === "match_planned" && row.matchTransactionId) {
      const existing = appData.transactions.find(transaction => transaction.id === row.matchTransactionId);
      if (existing) {
        const previousSigned = getSignedAmountForAccount(existing, accountId, cutoffDate);
        projected -= previousSigned;
      }
      projected += signedAmount;
      return;
    }

    if (type === "income" || type === "expense" || type === "transfer") {
      projected += signedAmount;
    }
  });

  return projected;
}

function getSignedAmountForAccount(transaction, accountId, cutoffDate) {
  if (!transaction || !accountId || !transaction.date || transaction.date > cutoffDate) return 0;
  if (transaction.accountId !== accountId) return 0;
  if (transaction.type === "income") return Number(transaction.amount || 0);
  if (transaction.type === "expense") return -Number(transaction.amount || 0);
  return 0;
}

// One authoritative day-by-day balance timeline per account, merging every
// statement for that account in this import (newest statement wins where
// they overlap).
export function getAccountTimelines(analysis) {
  const files = analysis?.files || [];
  const accountIds = [...new Set(files.map(fileAnalysis => fileAnalysis.accountId))];
  return accountIds
    .map(accountId => ({ accountId, timeline: buildCsvBalanceTimeline(files.filter(fileAnalysis => fileAnalysis.accountId === accountId)) }))
    .filter(item => item.timeline.length > 0);
}

// This account's CSV rows with the user's edits applied, in the shape
// diagnoseCsvBalanceGaps() expects.
export function buildDiagnosisRows(analysis, rowEdits, accountId) {
  return (analysis?.rows || [])
    .filter(row => (row.sourceAccountId || analysis.accountId) === accountId)
    .map(row => {
      const edit = getRowEdit(rowEdits, row);
      const include = edit.include ?? row.defaultInclude;
      const action = edit.action || row.action;
      const amount = Number(edit.amount ?? row.amount);
      const status = action === "duplicate"
        ? (row.overlapDuplicateOf ? "overlap_duplicate" : "duplicate")
        : include ? "imported" : "unticked";
      return {
        id: row.id,
        date: edit.date || row.date,
        signedAmount: amount * (row.signedAmount < 0 ? -1 : 1),
        description: edit.description || row.description,
        sourceRowHash: row.sourceRowHash,
        fileId: row.fileId ?? null,
        fileName: row.sourceFileName || analysis.fileName,
        status,
        likelyClearedPending: Boolean(row.likelyClearedPending)
      };
    });
}

// The date range each account's statement(s) cover in this import.
export function getAccountRanges(analysis) {
  const ranges = new Map();
  (analysis?.files || []).forEach(fileAnalysis => {
    const from = fileAnalysis.firstCsvDate;
    const to = fileAnalysis.reconciliation?.latestCsvDate || fileAnalysis.firstCsvDate;
    if (!from || !to) return;
    const current = ranges.get(fileAnalysis.accountId);
    ranges.set(fileAnalysis.accountId, {
      accountId: fileAnalysis.accountId,
      fromDate: current && current.fromDate < from ? current.fromDate : from,
      toDate: current && current.toDate > to ? current.toDate : to
    });
  });
  return [...ranges.values()];
}

// Saves what a "replace this period" import cleared out onto that account's
// import batch (the last one, if several statements were for it), so Undo
// import can put it all back.
export function attachReplacedData(data, batches, replacedByAccount) {
  const accountIds = Object.keys(replacedByAccount || {});
  if (!accountIds.length) return data;
  const batchIdByAccount = new Map();
  (batches || []).forEach(batch => batchIdByAccount.set(batch.accountId, batch.id));
  const batchReplaced = new Map();
  accountIds.forEach(accountId => {
    const batchId = batchIdByAccount.get(accountId) || batches?.at(-1)?.id;
    if (!batchId) return;
    const existing = batchReplaced.get(batchId) || { removedTransactions: [], changedTransactions: [], removedAdjustments: [] };
    const replaced = replacedByAccount[accountId];
    batchReplaced.set(batchId, {
      removedTransactions: [...existing.removedTransactions, ...(replaced.removedTransactions || [])],
      changedTransactions: [...existing.changedTransactions, ...(replaced.changedTransactions || [])],
      removedAdjustments: [...existing.removedAdjustments, ...(replaced.removedAdjustments || [])]
    });
  });
  return {
    ...data,
    importBatches: (data.importBatches || []).map(batch => batchReplaced.has(batch.id) ? { ...batch, replacedData: batchReplaced.get(batch.id) } : batch)
  };
}

export function countUnreadableRows(analysis) {
  return (analysis?.files || []).reduce((total, file) => (
    total + (file.unreadableRows || []).filter(row => row.kind === "error").length
  ), 0);
}

export function getMatchedTransactionInfo(row, edit, analysis, appData, accounts) {
  const action = edit.action || row.action;
  const type = edit.type || row.type;

  // Two CSVs uploaded together: the opposite-sign row already sitting in the
  // combined preview (before anything is saved). Only show this while the
  // row is still actually being treated as a transfer — once refreshed/
  // unlinked, this row stopped claiming the match, so don't keep showing it.
  if (row.crossFileMatchId && type === "transfer") {
    const other = (analysis.rows || []).find(item => item.id === row.crossFileMatchId);
    if (other) {
      const accountName = accounts.find(account => account.id === other.sourceAccountId)?.name
        || other.sourceFileName
        || "Other account";
      return { date: other.date, description: other.description, signedAmount: other.signedAmount, accountName, originalType: null };
    }
  }

  // A transfer already saved in this account (e.g. from an earlier CSV import)
  // that this row is being linked to. If it was originally saved as a plain
  // income/expense (nobody realised it was actually a transfer until now),
  // surface that so it can be edited/kept as-is instead of silently merged.
  if ((action === "match_existing_transfer" || (row.action === "match_existing_transfer" && action === "new")) && row.matchTransactionId) {
    const existing = (appData.transactions || []).find(transaction => transaction.id === row.matchTransactionId);
    if (existing) {
      const linkedAccountId = edit.linkedAccountId || row.linkedAccountId;
      const accountName = accounts.find(account => account.id === linkedAccountId)?.name
        || accounts.find(account => account.id === existing.accountId)?.name
        || "Other account";
      const signedAmount = existing.type === "income" ? Number(existing.amount || 0) : -Number(existing.amount || 0);
      return { date: existing.date, description: existing.title || "Matched transaction", signedAmount, accountName, originalType: existing.type };
    }
  }

  return null;
}

// After an import actually lands, check the real math rather than trusting
// the preview: recompute each account's balance as of its last statement day
// and compare it to the bank's own balance for that day (the newest
// statement's, where several overlap). `adjustmentsByAccount` lists any
// "Trust the CSV" adjustments, so the result can say what was added.
export function verifyImportBalances(finalData, accountTimelines, adjustmentsByAccount = {}) {
  return accountTimelines.map(({ accountId, timeline }) => {
    const lastDay = timeline.at(-1);
    const account = finalData.accounts.find(item => item.id === accountId);
    const calculatedBalance = calculateAccountBalanceAtDate(finalData, accountId, lastDay.date);
    const csvBalance = Number(lastDay.balance);
    const difference = roundMoney(calculatedBalance - csvBalance);
    return {
      accountId,
      accountName: account?.name || "Account",
      asOfDate: lastDay.date,
      csvFileName: lastDay.fileName,
      calculatedBalance,
      csvBalance,
      difference,
      matches: Math.abs(difference) < 0.005,
      trustAdjustments: adjustmentsByAccount[accountId] || []
    };
  });
}

// Preview check: the projected (untrusted) balances, plus — for each
// account whose CSV is trusted — the adjustments the import would add.
export function buildPreviewVerification(projectedData, analysis, isTrusted) {
  const timelines = getAccountTimelines(analysis);
  const adjustmentsByAccount = {};
  timelines.forEach(({ accountId, timeline }) => {
    if (!isTrusted(accountId)) return;
    adjustmentsByAccount[accountId] = alignAccountToCsvTimeline(projectedData, accountId, timeline).adjustments;
  });
  return verifyImportBalances(projectedData, timelines, adjustmentsByAccount);
}

export function groupAdjustmentsByAccount(adjustments) {
  return (adjustments || []).reduce((groups, adjustment) => {
    (groups[adjustment.accountId] ||= []).push(adjustment);
    return groups;
  }, {});
}

export function summariseCombinedAnalyses(analyses, rows) {
  const base = {
    total: rows.length,
    newRows: 0,
    plannedMatches: 0,
    existingTransferMatches: 0,
    duplicates: 0,
    needsReview: 0,
    transfers: rows.filter(row => row.type === "transfer").length,
    largeExpenses: rows.filter(row => row.suggestedExcludeFromBudget).length
  };
  rows.forEach(row => {
    if (row.action === "duplicate") base.duplicates += 1;
    else if (row.action === "match_planned") base.plannedMatches += 1;
    else if (row.action === "match_existing_transfer") base.existingTransferMatches += 1;
    else base.newRows += 1;
    if (row.warning || row.confidence === "Needs review") base.needsReview += 1;
  });
  return base;
}
