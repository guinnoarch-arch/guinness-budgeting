import { daysElapsedInMonth, formatMonthLabel, getPreviousMonthKey, isInMonth } from "./dates.js";

export function getCategoryById(categories, id) {
  return categories.find(category => category.id === id);
}

export function getAccountById(accounts, id) {
  return accounts.find(account => account.id === id);
}

export function isSavingsAccount(accounts, accountId) {
  const account = getAccountById(accounts, accountId);
  return account?.type === "savings";
}

export function normaliseAccountFilter(accountId) {
  return accountId && accountId !== "all" ? accountId : null;
}

export function transactionMatchesAccount(transaction, accountId) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  if (!selectedAccountId) return true;

  if (transaction.type === "transfer") {
    return transaction.fromAccountId === selectedAccountId || transaction.toAccountId === selectedAccountId;
  }

  return transaction.accountId === selectedAccountId;
}

function getBudgetAccountId(budget) {
  // Older saved V1 data did not have budget.accountId.
  // Treat those old budgets as current-account budgets so they do not appear as zero in savings/cash views.
  return budget?.accountId || "acc_current";
}

function budgetMatchesAccount(budget, accountId) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  if (!selectedAccountId) return true;
  return getBudgetAccountId(budget) === selectedAccountId;
}

function expenseMatchesAccount(transaction, accountId) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  if (!selectedAccountId) return transaction.type === "expense";
  return transaction.type === "expense" && transaction.accountId === selectedAccountId;
}

function incomeMatchesAccount(transaction, accountId) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  if (!selectedAccountId) return transaction.type === "income";
  return transaction.type === "income" && transaction.accountId === selectedAccountId;
}

export function isBudgetCountedExpense(transaction) {
  return transaction?.type === "expense" && transaction.excludeFromBudget !== true;
}

export function isBudgetExcludedExpense(transaction) {
  return transaction?.type === "expense" && transaction.excludeFromBudget === true;
}

function getSpendableAccountIds(data, activeBudgets, accountId = null) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  if (selectedAccountId) return [selectedAccountId];

  const budgetAccountIds = [...new Set((activeBudgets || [])
    .map(budget => getBudgetAccountId(budget))
    .filter(Boolean))];

  if (budgetAccountIds.length > 0) return budgetAccountIds;

  return (data.accounts || [])
    .filter(account => account.isActive !== false)
    .filter(account => account.type === "current" || account.type === "cash" || account.type === "other")
    .map(account => account.id);
}

function getSpendableBalance(data, activeBudgets, accountId = null) {
  return sum(getSpendableAccountIds(data, activeBudgets, accountId)
    .map(spendableAccountId => calculateAccountBalance(data, spendableAccountId)));
}

export function getBudgetLeftSummary(data, monthKey, accountId = null) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  const monthExpenses = getTransactionsForMonth(data.transactions || [], monthKey)
    .filter(t => t.type === "expense")
    .filter(t => !selectedAccountId || t.accountId === selectedAccountId);

  const activeBudgets = (data.budgets || [])
    .filter(budget => budget.month === monthKey && budget.isEnabled && !budget.isArchived && !budget.archivedAt)
    .filter(budget => budgetMatchesAccount(budget, selectedAccountId));

  const budgetKeys = new Set(activeBudgets.map(budget => `${budget.categoryId}_${getBudgetAccountId(budget)}`));
  const totalBudgetLimit = sum(activeBudgets.map(budget => budget.limit));
  const countedSpending = sum(monthExpenses
    .filter(isBudgetCountedExpense)
    .filter(transaction => budgetKeys.has(`${transaction.categoryId}_${transaction.accountId}`))
    .map(transaction => transaction.amount));
  const excludedSpending = sum(monthExpenses.filter(isBudgetExcludedExpense).map(transaction => transaction.amount));
  const budgetLeftRaw = totalBudgetLimit - countedSpending;
  const spendableBalance = getSpendableBalance(data, activeBudgets, selectedAccountId);
  const budgetLeft = budgetLeftRaw > 0 ? Math.min(budgetLeftRaw, spendableBalance) : budgetLeftRaw;
  const affordabilityGap = budgetLeftRaw - spendableBalance;
  const threshold = Number(data.settings?.budgetAffordabilityThreshold || 100);
  const affordabilityWarning = Boolean(
    data.settings?.budgetAffordabilityWarningsEnabled !== false
    && budgetLeftRaw > 0
    && spendableBalance >= 0
    && affordabilityGap >= -threshold
  );

  return {
    totalBudgetLimit,
    countedSpending,
    excludedSpending,
    budgetLeftRaw,
    budgetLeft,
    spendableBalance,
    affordabilityGap,
    affordabilityWarning,
    activeBudgetCount: activeBudgets.length
  };
}

function getSavingsTransferAmount(data, transactions, accountId) {
  const selectedAccountId = normaliseAccountFilter(accountId);

  return sum(
    transactions
      .filter(transaction => {
        if (transaction.type !== "transfer") return false;
        const goesToSavings = isSavingsAccount(data.accounts, transaction.toAccountId);
        if (!goesToSavings) return false;

        if (!selectedAccountId) return true;

        const selectedAccountIsSavings = isSavingsAccount(data.accounts, selectedAccountId);
        if (selectedAccountIsSavings) {
          return transaction.toAccountId === selectedAccountId;
        }

        return transaction.fromAccountId === selectedAccountId;
      })
      .map(transaction => transaction.amount)
  );
}

function getAccountMoneyIn(transactions, accountId) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  if (!selectedAccountId) return 0;

  const income = sum(transactions
    .filter(t => t.type === "income" && t.accountId === selectedAccountId)
    .map(t => t.amount));

  const transfersIn = sum(transactions
    .filter(t => t.type === "transfer" && t.toAccountId === selectedAccountId)
    .map(t => t.amount));

  return income + transfersIn;
}

function getAccountMoneyOut(transactions, accountId) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  if (!selectedAccountId) return 0;

  const expenses = sum(transactions
    .filter(t => t.type === "expense" && t.accountId === selectedAccountId)
    .map(t => t.amount));

  const transfersOut = sum(transactions
    .filter(t => t.type === "transfer" && t.fromAccountId === selectedAccountId)
    .map(t => t.amount));

  return expenses + transfersOut;
}

export function getTransactionsForMonth(transactions, monthKey) {
  return transactions.filter(txn => isInMonth(txn.date, monthKey));
}

function getMonthKeysEndingAt(monthKey, count) {
  const [year, month] = monthKey.split("-").map(Number);

  return Array.from({ length: count }, (_, index) => {
    const offsetFromCurrent = count - index - 1;
    const date = new Date(year, month - 1 - offsetFromCurrent, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function getSixMonthDashboardTrend(data, monthKey, accountId, trendIsSavings, includeExcludedSpending = false) {
  return getMonthKeysEndingAt(monthKey, 6).map(trendMonthKey => {
    const monthTransactions = getTransactionsForMonth(data.transactions || [], trendMonthKey);
    const value = trendIsSavings
      ? getAccountMoneyIn(monthTransactions, accountId)
      : sum(monthTransactions
        .filter(t => expenseMatchesAccount(t, accountId))
        .filter(t => includeExcludedSpending || !isBudgetExcludedExpense(t))
        .map(t => t.amount));

    return {
      monthKey: trendMonthKey,
      name: formatMonthLabel(trendMonthKey),
      spending: value
    };
  });
}

export function calculateMonthSummary(data, monthKey, options = {}) {
  const accountId = normaliseAccountFilter(options.accountId);
  const selectedAccountIsSavings = accountId ? isSavingsAccount(data.accounts, accountId) : false;
  const includeExcludedSpendingInCharts = Boolean(options.includeExcludedSpendingInCharts);

  const monthTransactionsAll = getTransactionsForMonth(data.transactions, monthKey);
  const previousMonth = getPreviousMonthKey(monthKey);
  const previousTransactionsAll = getTransactionsForMonth(data.transactions, previousMonth);
  const twoMonthsAgo = getPreviousMonthKey(previousMonth);
  const twoMonthsAgoTransactionsAll = getTransactionsForMonth(data.transactions, twoMonthsAgo);

  const monthTransactions = monthTransactionsAll.filter(transaction => transactionMatchesAccount(transaction, accountId));

  const income = sum(monthTransactionsAll.filter(t => incomeMatchesAccount(t, accountId)).map(t => t.amount));
  const expenses = sum(monthTransactionsAll.filter(t => expenseMatchesAccount(t, accountId)).map(t => t.amount));
  const savingsTransfers = getSavingsTransferAmount(data, monthTransactionsAll, accountId);

  const transferIn = accountId
    ? sum(monthTransactionsAll.filter(t => t.type === "transfer" && t.toAccountId === accountId).map(t => t.amount))
    : 0;
  const transferOut = accountId
    ? sum(monthTransactionsAll.filter(t => t.type === "transfer" && t.fromAccountId === accountId).map(t => t.amount))
    : 0;

  const accountMoneyIn = accountId ? income + transferIn : income;
  const accountMoneyOut = accountId ? expenses + transferOut : expenses;

  const carryForward = accountId
    ? 0
    : data.closedMonths.find(closed => closed.month === previousMonth)?.carriedForward || 0;

  const netMoneyLeft = accountId
    ? accountMoneyIn - accountMoneyOut
    : income + carryForward - expenses - savingsTransfers;

  const budgetLeftSummary = getBudgetLeftSummary(data, monthKey, accountId);
  const moneyLeft = selectedAccountIsSavings ? netMoneyLeft : budgetLeftSummary.budgetLeft;

  const previousIncome = sum(previousTransactionsAll.filter(t => incomeMatchesAccount(t, accountId)).map(t => t.amount));
  const previousExpenses = sum(previousTransactionsAll.filter(t => expenseMatchesAccount(t, accountId)).map(t => t.amount));
  const previousSavings = getSavingsTransferAmount(data, previousTransactionsAll, accountId);
  const previousAccountMoneyIn = accountId ? getAccountMoneyIn(previousTransactionsAll, accountId) : previousIncome;
  const previousAccountMoneyOut = accountId ? getAccountMoneyOut(previousTransactionsAll, accountId) : previousExpenses;

  const twoMonthsAgoExpenses = sum(twoMonthsAgoTransactionsAll.filter(t => expenseMatchesAccount(t, accountId)).map(t => t.amount));
  const twoMonthsAgoAccountMoneyIn = accountId ? getAccountMoneyIn(twoMonthsAgoTransactionsAll, accountId) : 0;

  const trendIsSavings = selectedAccountIsSavings;
  const spendingTrend = getSixMonthDashboardTrend(data, monthKey, accountId, trendIsSavings, includeExcludedSpendingInCharts);

  const dailySpendingComparison = trendIsSavings
    ? getDailySavingComparison(data, monthKey, accountId)
    : getDailySpendingComparison(data, monthKey, accountId, includeExcludedSpendingInCharts);

  const savingsGoalBreakdown = trendIsSavings
    ? getSavingsGoalBreakdown(data, monthKey, accountId)
    : [];

  const budgetBreakdown = trendIsSavings
    ? []
    : getCategorySpend(data, monthKey, accountId)
      .filter(item => Number(item.spent || 0) > 0 || Number(item.limit || 0) > 0)
      .map(item => ({
        id: item.id,
        name: item.category?.name || "Budget",
        spent: Number(item.spent || 0),
        excludedSpent: Number(item.excludedSpent || 0),
        limit: Number(item.limit || 0),
        remaining: Number(item.remaining || 0),
        accountName: item.account?.name || ""
      }));

  const savingsRate = income > 0 ? (savingsTransfers / income) * 100 : 0;
  const averageDailySpend = expenses / Math.max(daysElapsedInMonth(monthKey), 1);
  const largestExpense = monthTransactions
    .filter(t => t.type === "expense")
    .sort((a, b) => b.amount - a.amount)[0];

  return {
    monthKey,
    accountId,
    isSavingsView: trendIsSavings,
    income,
    expenses,
    savingsTransfers,
    transferIn,
    transferOut,
    accountMoneyIn,
    accountMoneyOut,
    carryForward,
    moneyLeft,
    netMoneyLeft,
    budgetLeftSummary,
    totalBudgetLimit: budgetLeftSummary.totalBudgetLimit,
    budgetCountedSpending: budgetLeftSummary.countedSpending,
    excludedSpending: budgetLeftSummary.excludedSpending,
    budgetLeftRaw: budgetLeftSummary.budgetLeftRaw,
    spendableBalance: budgetLeftSummary.spendableBalance,
    budgetAffordabilityWarning: budgetLeftSummary.affordabilityWarning,
    budgetAffordabilityGap: budgetLeftSummary.affordabilityGap,
    savingsRate,
    averageDailySpend,
    largestExpense,
    previousIncome,
    previousExpenses,
    previousSavings,
    previousAccountMoneyIn,
    previousAccountMoneyOut,
    twoMonthsAgoExpenses,
    spendingTrend,
    dailySpendingComparison,
    savingsGoalBreakdown,
    budgetBreakdown,
    chartMetricName: trendIsSavings ? "Saved" : "Spending",
    comparisonChartTitle: trendIsSavings ? "Savings - last 6 months" : "Spending - last 6 months",
    incomeChange: percentChange(income, previousIncome),
    expenseChange: percentChange(expenses, previousExpenses),
    savingsChange: percentChange(savingsTransfers, previousSavings),
    accountMoneyInChange: percentChange(accountMoneyIn, previousAccountMoneyIn),
    accountMoneyOutChange: percentChange(accountMoneyOut, previousAccountMoneyOut),
    monthTransactions,
    isAccountFiltered: Boolean(accountId)
  };
}

export function getDailySpendingComparison(data, monthKey, accountId = null, includeExcludedSpending = false) {
  const previousMonth = getPreviousMonthKey(monthKey);
  const twoMonthsAgo = getPreviousMonthKey(previousMonth);
  const maxDays = daysInCalendarMonth(monthKey);

  const currentSeries = getCumulativeExpenseSeries(data.transactions, monthKey, maxDays, accountId, includeExcludedSpending);
  const previousSeries = getCumulativeExpenseSeries(data.transactions, previousMonth, maxDays, accountId, includeExcludedSpending);
  const twoMonthsAgoSeries = getCumulativeExpenseSeries(data.transactions, twoMonthsAgo, maxDays, accountId, includeExcludedSpending);

  return {
    title: "Spending through the month",
    description: "Cumulative spending by day of the month compared with the last two months.",
    metricName: "Spending",
    labels: {
      current: formatMonthLabel(monthKey),
      previous: formatMonthLabel(previousMonth),
      twoMonthsAgo: formatMonthLabel(twoMonthsAgo)
    },
    data: Array.from({ length: maxDays }, (_, index) => {
      const day = index + 1;
      return {
        day,
        current: currentSeries[index],
        previous: previousSeries[index],
        twoMonthsAgo: twoMonthsAgoSeries[index]
      };
    })
  };
}

export function getDailySavingComparison(data, monthKey, accountId = null) {
  const previousMonth = getPreviousMonthKey(monthKey);
  const twoMonthsAgo = getPreviousMonthKey(previousMonth);
  const maxDays = daysInCalendarMonth(monthKey);

  const currentSeries = getCumulativeSavingInSeries(data.transactions, monthKey, maxDays, accountId);
  const previousSeries = getCumulativeSavingInSeries(data.transactions, previousMonth, maxDays, accountId);
  const twoMonthsAgoSeries = getCumulativeSavingInSeries(data.transactions, twoMonthsAgo, maxDays, accountId);

  return {
    title: "Savings through the month",
    description: "Cumulative money saved into this savings account by day, compared with the last two months.",
    metricName: "Saved",
    labels: {
      current: formatMonthLabel(monthKey),
      previous: formatMonthLabel(previousMonth),
      twoMonthsAgo: formatMonthLabel(twoMonthsAgo)
    },
    data: Array.from({ length: maxDays }, (_, index) => {
      const day = index + 1;
      return {
        day,
        current: currentSeries[index],
        previous: previousSeries[index],
        twoMonthsAgo: twoMonthsAgoSeries[index]
      };
    })
  };
}

function getCumulativeExpenseSeries(transactions, monthKey, maxDays, accountId = null, includeExcludedSpending = false) {
  const monthDays = daysInCalendarMonth(monthKey);
  const visibleDays = daysElapsedInMonth(monthKey);
  const dailyTotals = Array(monthDays).fill(0);

  transactions
    .filter(t => expenseMatchesAccount(t, accountId) && isInMonth(t.date, monthKey))
    .filter(t => includeExcludedSpending || !isBudgetExcludedExpense(t))
    .forEach(transaction => {
      const day = Number(transaction.date?.slice(8, 10));
      if (day >= 1 && day <= monthDays) {
        dailyTotals[day - 1] += Number(transaction.amount || 0);
      }
    });

  let cumulative = 0;
  return Array.from({ length: maxDays }, (_, index) => {
    const day = index + 1;
    if (day > monthDays || day > visibleDays) return null;
    cumulative += dailyTotals[index] || 0;
    return cumulative;
  });
}

function getCumulativeSavingInSeries(transactions, monthKey, maxDays, accountId = null) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  const monthDays = daysInCalendarMonth(monthKey);
  const visibleDays = daysElapsedInMonth(monthKey);
  const dailyTotals = Array(monthDays).fill(0);

  transactions
    .filter(t => isInMonth(t.date, monthKey))
    .filter(t => {
      if (!selectedAccountId) return false;
      if (t.type === "transfer") return t.toAccountId === selectedAccountId;
      if (t.type === "income") return t.accountId === selectedAccountId;
      return false;
    })
    .forEach(transaction => {
      const day = Number(transaction.date?.slice(8, 10));
      if (day >= 1 && day <= monthDays) {
        dailyTotals[day - 1] += Number(transaction.amount || 0);
      }
    });

  let cumulative = 0;
  return Array.from({ length: maxDays }, (_, index) => {
    const day = index + 1;
    if (day > monthDays || day > visibleDays) return null;
    cumulative += dailyTotals[index] || 0;
    return cumulative;
  });
}

function daysInCalendarMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export function getSavingsGoalBreakdown(data, monthKey, accountId = null) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  if (!selectedAccountId) return [];

  const totalsByName = new Map();

  getTransactionsForMonth(data.transactions, monthKey)
    .filter(t => {
      if (t.type === "transfer") return t.toAccountId === selectedAccountId;
      if (t.type === "income") return t.accountId === selectedAccountId;
      return false;
    })
    .forEach(transaction => {
      const goal = data.savingsGoals.find(item => item.id === transaction.linkedSavingsGoalId);
      const name = goal?.name || "Unassigned savings";
      totalsByName.set(name, (totalsByName.get(name) || 0) + Number(transaction.amount || 0));
    });

  return Array.from(totalsByName.entries())
    .map(([name, value]) => ({ name, value }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function getCategorySpend(data, monthKey, accountId = null) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  const monthExpenses = getTransactionsForMonth(data.transactions, monthKey)
    .filter(t => t.type === "expense")
    .filter(t => !selectedAccountId || t.accountId === selectedAccountId);

  const countedMonthExpenses = monthExpenses.filter(isBudgetCountedExpense);
  const excludedMonthExpenses = monthExpenses.filter(isBudgetExcludedExpense);

  const monthBudgets = (data.budgets || [])
    .filter(budget => budget.month === monthKey && budget.isEnabled && !budget.isArchived && !budget.archivedAt)
    .filter(budget => budgetMatchesAccount(budget, selectedAccountId));

  const budgetItems = monthBudgets
    .map(budget => {
      const category = getCategoryById(data.categories, budget.categoryId);
      if (!category || category.type !== "expense" || category.isActive === false) return null;

      const budgetAccountId = getBudgetAccountId(budget);
      const spent = sum(countedMonthExpenses
        .filter(t => t.categoryId === category.id)
        .filter(t => !budgetAccountId || t.accountId === budgetAccountId)
        .map(t => t.amount));

      const excludedSpent = sum(excludedMonthExpenses
        .filter(t => t.categoryId === category.id)
        .filter(t => !budgetAccountId || t.accountId === budgetAccountId)
        .map(t => t.amount));

      const limit = Number(budget.limit || 0);
      const usedPercent = limit > 0 ? (spent / limit) * 100 : 0;
      const account = getAccountById(data.accounts, budgetAccountId);

      return {
        id: `${category.id}_${budgetAccountId}`,
        category,
        account,
        accountId: budgetAccountId,
        spent,
        excludedSpent,
        totalSpent: spent + excludedSpent,
        budget: { ...budget, accountId: budgetAccountId },
        limit,
        remaining: limit - spent,
        usedPercent
      };
    })
    .filter(Boolean);

  const budgetKeys = new Set(budgetItems.map(item => `${item.category.id}_${item.accountId}`));

  const extraSpendItems = data.categories
    .filter(category => category.type === "expense" && category.isActive !== false)
    .flatMap(category => {
      const accountIds = selectedAccountId
        ? [selectedAccountId]
        : [...new Set(monthExpenses.filter(t => t.categoryId === category.id).map(t => t.accountId).filter(Boolean))];

      return accountIds
        .filter(spendAccountId => !budgetKeys.has(`${category.id}_${spendAccountId}`))
        .map(spendAccountId => {
          const spent = sum(countedMonthExpenses
            .filter(t => t.categoryId === category.id && t.accountId === spendAccountId)
            .map(t => t.amount));

          const excludedSpent = sum(excludedMonthExpenses
            .filter(t => t.categoryId === category.id && t.accountId === spendAccountId)
            .map(t => t.amount));

          if (spent <= 0 && excludedSpent <= 0) return null;

          return {
            id: `${category.id}_${spendAccountId}`,
            category,
            account: getAccountById(data.accounts, spendAccountId),
            accountId: spendAccountId,
            spent,
            excludedSpent,
            totalSpent: spent + excludedSpent,
            budget: null,
            limit: 0,
            remaining: -spent,
            usedPercent: 0
          };
        })
        .filter(Boolean);
    });

  return [...budgetItems, ...extraSpendItems];
}

export function getBudgetWarnings(data, monthKey, accountId = null) {
  return getCategorySpend(data, monthKey, accountId)
    .filter(item => item.limit > 0 && item.usedPercent >= (data.settings?.budgetWarningThresholds?.greenMax ?? 75))
    .sort((a, b) => b.usedPercent - a.usedPercent);
}

export function calculateAccountBalance(data, accountId) {
  const account = data.accounts.find(acc => acc.id === accountId);
  if (!account) return 0;

  const openingBalance = Number(account.openingBalance || 0);
  const adjustments = sum((data.accountAdjustments || [])
    .filter(adj => adj.accountId === accountId)
    .map(adj => adj.amount));

  const income = sum(data.transactions
    .filter(t => t.type === "income" && t.accountId === accountId)
    .map(t => t.amount));

  const expenses = sum(data.transactions
    .filter(t => t.type === "expense" && t.accountId === accountId)
    .map(t => t.amount));

  const transfersIn = sum(data.transactions
    .filter(t => t.type === "transfer" && t.toAccountId === accountId)
    .map(t => t.amount));

  const transfersOut = sum(data.transactions
    .filter(t => t.type === "transfer" && t.fromAccountId === accountId)
    .map(t => t.amount));

  return openingBalance + adjustments + income - expenses + transfersIn - transfersOut;
}

export function calculateAccountBalanceAtDate(data, accountId, cutoffDate) {
  const account = data.accounts.find(acc => acc.id === accountId);
  if (!account || !cutoffDate) return 0;

  const openingBalance = Number(account.openingBalance || 0);
  const adjustments = sum((data.accountAdjustments || [])
    .filter(adj => adj.accountId === accountId && (!adj.date || adj.date <= cutoffDate))
    .map(adj => adj.amount));

  const income = sum(data.transactions
    .filter(t => t.type === "income" && t.accountId === accountId && t.date <= cutoffDate)
    .map(t => t.amount));

  const expenses = sum(data.transactions
    .filter(t => t.type === "expense" && t.accountId === accountId && t.date <= cutoffDate)
    .map(t => t.amount));

  const transfersIn = sum(data.transactions
    .filter(t => t.type === "transfer" && t.toAccountId === accountId && t.date <= cutoffDate)
    .map(t => t.amount));

  const transfersOut = sum(data.transactions
    .filter(t => t.type === "transfer" && t.fromAccountId === accountId && t.date <= cutoffDate)
    .map(t => t.amount));

  return openingBalance + adjustments + income - expenses + transfersIn - transfersOut;
}

export function getSavingsGoalProgress(data, goal) {
  const linkedTransfers = sum(data.transactions
    .filter(t => t.type === "transfer" && t.linkedSavingsGoalId === goal.id)
    .map(t => t.amount));

  const saved = Number(goal.currentManualAmount || 0) + linkedTransfers;
  const remaining = Math.max(Number(goal.targetAmount || 0) - saved, 0);
  const percent = goal.targetAmount > 0 ? (saved / goal.targetAmount) * 100 : 0;
  return { saved, remaining, percent };
}

export function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

export function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}
