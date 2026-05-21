import {
  calculateAccountBalanceAtDate,
  calculateMonthSummary,
  getAccountById,
  getCategoryById,
  getCategorySpend,
  getTransactionsForMonth,
  sum
} from "./calculations.js";
import { formatMonthLabel, getMonthKey, isInMonth } from "./dates.js";

function addMonths(monthKey, offset) {
  const [year, month] = monthKey.split("-").map(Number);
  return getMonthKey(new Date(year, month - 1 + offset, 1));
}

function getMonthEndDate(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${monthKey}-${String(lastDay).padStart(2, "0")}`;
}

function getRecentMonthKeys(selectedMonth, count = 6) {
  return Array.from({ length: count }, (_, index) => addMonths(selectedMonth, index - count + 1));
}

function shortMonthLabel(monthKey) {
  return formatMonthLabel(monthKey).replace(" 20", " \'");
}

function sortByDateDesc(a, b) {
  return String(b.date || "").localeCompare(String(a.date || ""));
}

function transactionAccountName(data, transaction) {
  if (transaction.type === "transfer") {
    const from = getAccountById(data.accounts, transaction.fromAccountId)?.name || "Unknown";
    const to = getAccountById(data.accounts, transaction.toAccountId)?.name || "Unknown";
    return `${from} → ${to}`;
  }
  return getAccountById(data.accounts, transaction.accountId)?.name || "Unknown";
}

function transactionCategoryName(data, transaction) {
  if (transaction.type === "transfer") return "Transfer";
  return getCategoryById(data.categories, transaction.categoryId)?.name || "Uncategorised";
}

function getIncomeByCategory(data, monthKey) {
  const income = getTransactionsForMonth(data.transactions, monthKey).filter(t => t.type === "income");
  const totals = new Map();

  income.forEach(transaction => {
    const category = transactionCategoryName(data, transaction);
    totals.set(category, (totals.get(category) || 0) + Number(transaction.amount || 0));
  });

  return Array.from(totals.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function getSavingsTransfersByAccount(data, monthKey) {
  const transfers = getTransactionsForMonth(data.transactions, monthKey).filter(transaction => transaction.type === "transfer");
  const totals = new Map();

  transfers.forEach(transaction => {
    const toAccount = getAccountById(data.accounts, transaction.toAccountId);
    if (toAccount?.type !== "savings") return;
    totals.set(toAccount.name, (totals.get(toAccount.name) || 0) + Number(transaction.amount || 0));
  });

  return Array.from(totals.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function getMonthlyTrend(data, selectedMonth) {
  return getRecentMonthKeys(selectedMonth, 6).map(monthKey => {
    const summary = calculateMonthSummary(data, monthKey);
    return {
      monthKey,
      name: shortMonthLabel(monthKey),
      fullName: formatMonthLabel(monthKey),
      income: summary.income,
      expenses: summary.expenses,
      savings: summary.savingsTransfers,
      moneyLeft: summary.moneyLeft
    };
  });
}

function getAccountBalanceTrend(data, selectedMonth) {
  const months = getRecentMonthKeys(selectedMonth, 6);
  const activeAccounts = (data.accounts || []).filter(account => account.isActive !== false);

  return months.map(monthKey => {
    const cutoffDate = getMonthEndDate(monthKey);
    const row = {
      monthKey,
      name: shortMonthLabel(monthKey),
      fullName: formatMonthLabel(monthKey),
      total: 0,
      spendable: 0,
      savings: 0
    };

    activeAccounts.forEach(account => {
      const balance = calculateAccountBalanceAtDate(data, account.id, cutoffDate);
      row.total += balance;
      if (account.type === "savings") row.savings += balance;
      if (account.type === "current" || account.type === "cash") row.spendable += balance;
    });

    return row;
  });
}

function getCategoryReportRows(data, monthKey) {
  return getCategorySpend(data, monthKey)
    .filter(item => item.spent > 0 || item.limit > 0)
    .map(item => ({
      id: item.id,
      category: item.category?.name || "Unknown category",
      group: item.category?.group || "Other",
      account: item.account?.name || "All accounts",
      planned: Number(item.limit || 0),
      actual: Number(item.spent || 0),
      excludedActual: Number(item.excludedSpent || 0),
      totalActual: Number(item.totalSpent ?? item.spent ?? 0),
      remaining: Number(item.remaining || 0),
      usedPercent: Number(item.usedPercent || 0),
      status: item.limit > 0
        ? item.spent > item.limit
          ? "Over budget"
          : item.usedPercent >= 75
            ? "Watch"
            : "OK"
        : "No budget"
    }))
    .sort((a, b) => b.actual - a.actual);
}

function getPlannedVsActualRows(data, monthKey) {
  const rows = getTransactionsForMonth(data.transactions, monthKey)
    .filter(transaction => transaction.plannedDate || transaction.plannedAmount !== null && transaction.plannedAmount !== undefined || transaction.status === "matched")
    .map(transaction => {
      const plannedAmount = Number(transaction.plannedAmount ?? transaction.amount ?? 0);
      const actualAmount = Number(transaction.actualAmount ?? transaction.amount ?? 0);
      const plannedDate = transaction.plannedDate || transaction.date;
      const actualDate = transaction.actualDate || transaction.date;
      return {
        id: transaction.id,
        title: transaction.title,
        type: transaction.type,
        category: transactionCategoryName(data, transaction),
        account: transactionAccountName(data, transaction),
        plannedDate,
        actualDate,
        plannedAmount,
        actualAmount,
        difference: actualAmount - plannedAmount,
        status: transaction.status || "confirmed"
      };
    })
    .sort(sortByDateDesc);

  const totalPlanned = sum(rows.map(row => row.plannedAmount));
  const totalActual = sum(rows.map(row => row.actualAmount));

  return {
    rows,
    totalPlanned,
    totalActual,
    difference: totalActual - totalPlanned,
    matchedCount: rows.filter(row => row.status === "matched").length,
    plannedOnlyCount: rows.filter(row => row.status === "planned").length
  };
}

function getImportImpact(data, monthKey) {
  const monthTransactions = getTransactionsForMonth(data.transactions, monthKey);
  const importedTransactions = monthTransactions.filter(transaction => transaction.importSource === "csv" || transaction.status === "imported" || transaction.status === "matched" || Array.isArray(transaction.matchedBankRows) && transaction.matchedBankRows.length > 0);
  const importedAmount = sum(importedTransactions.map(transaction => Number(transaction.amount || 0)));

  const batches = (data.importBatches || []).filter(batch => {
    if (batch.latestCsvDate && isInMonth(batch.latestCsvDate, monthKey)) return true;
    const batchIds = new Set([...(batch.transactionIds || []), ...(batch.linkedTransactionIds || [])]);
    return monthTransactions.some(transaction => batchIds.has(transaction.id));
  });

  return {
    batches,
    batchCount: batches.length,
    importedTransactions,
    importedTransactionCount: importedTransactions.length,
    importedAmount,
    createdRows: sum(batches.map(batch => batch.importedRows || 0)),
    linkedRows: sum(batches.map(batch => batch.linkedRows || 0)),
    skippedRows: sum(batches.map(batch => batch.skippedRows || 0)),
    reconciliationAdjustments: (data.accountAdjustments || []).filter(adjustment => adjustment.source === "csv_import_reconciliation" && isInMonth(adjustment.date, monthKey))
  };
}

function getTopTransactions(data, monthKey, type = "expense", limit = 8) {
  return getTransactionsForMonth(data.transactions, monthKey)
    .filter(transaction => transaction.type === type)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, limit)
    .map(transaction => ({
      id: transaction.id,
      date: transaction.date,
      title: transaction.title,
      type: transaction.type,
      amount: Number(transaction.amount || 0),
      category: transactionCategoryName(data, transaction),
      account: transactionAccountName(data, transaction)
    }));
}

export function buildMonthlyReportData(data, monthKey) {
  const summary = calculateMonthSummary(data, monthKey);
  const categoryRows = getCategoryReportRows(data, monthKey);
  const plannedVsActual = getPlannedVsActualRows(data, monthKey);
  const incomeByCategory = getIncomeByCategory(data, monthKey);
  const savingsByAccount = getSavingsTransfersByAccount(data, monthKey);
  const importImpact = getImportImpact(data, monthKey);
  const monthlyTrend = getMonthlyTrend(data, monthKey);
  const accountBalanceTrend = getAccountBalanceTrend(data, monthKey);

  const topCategory = categoryRows[0] || null;
  const overBudgetCount = categoryRows.filter(row => row.status === "Over budget").length;
  const noBudgetSpend = sum(categoryRows.filter(row => row.planned <= 0).map(row => row.actual));
  const excludedSpend = sum(categoryRows.map(row => row.excludedActual || 0));

  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    generatedAt: new Date().toISOString(),
    summary,
    categoryRows,
    incomeByCategory,
    savingsByAccount,
    plannedVsActual,
    importImpact,
    monthlyTrend,
    accountBalanceTrend,
    topExpenses: getTopTransactions(data, monthKey, "expense", 8),
    headline: {
      topCategory,
      overBudgetCount,
      noBudgetSpend,
      excludedSpend,
      budgetCountedSpend: summary.budgetCountedSpending || 0,
      transactionCount: summary.monthTransactions.length,
      importedTransactionCount: importImpact.importedTransactionCount
    }
  };
}
