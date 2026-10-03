import { useMemo, useState } from "react";
import MonthSelector from "../components/dashboard/MonthSelector.jsx";
import MoneyLeftCard from "../components/dashboard/MoneyLeftCard.jsx";
import SummaryCard from "../components/dashboard/SummaryCard.jsx";
import SpendingComparisonChart from "../components/dashboard/SpendingComparisonChart.jsx";
import MonthlySpendingTrendChart from "../components/dashboard/MonthlySpendingTrendChart.jsx";
import MoneyBreakdownPie from "../components/dashboard/MoneyBreakdownPie.jsx";
import UpcomingBillsPanel from "../components/dashboard/UpcomingBillsPanel.jsx";
import RecentTransactionsPanel from "../components/dashboard/RecentTransactionsPanel.jsx";
import BudgetWarningsPanel from "../components/dashboard/BudgetWarningsPanel.jsx";
import SavingsGoalsPanel from "../components/dashboard/SavingsGoalsPanel.jsx";
import MajorSpendsModal from "../components/dashboard/MajorSpendsModal.jsx";
import { calculateAccountBalance, calculateMonthSummary, getMajorIncomes, getMajorSpends } from "../utils/calculations.js";
import { formatMoney } from "../utils/money.js";
import { DEFAULT_LARGE_EXPENSE_THRESHOLD, DEFAULT_LARGE_INCOME_THRESHOLD } from "../config/appDefaults.js";

function DashboardSummaryCards({ summary, isSavingsView, includeExcludedSpendingInCharts, onIncludeExcludedSpendingChange, onBreakdown, onMajorSpends, onMajorIncomes }) {
  if (isSavingsView) {
    return (
      <div className="summary-grid summary-grid-two dashboard-summary-grid">
        <SummaryCard label="Saved" value={summary.accountMoneyIn} change={summary.accountMoneyInChange} tone="positive" onClick={() => onBreakdown("Saved")} />
        <SummaryCard label="Spent" value={summary.expenses} change={summary.expenseChange} tone="negative" higherIsBetter={false} onClick={onMajorSpends} />
      </div>
    );
  }

  return (
    <div className="summary-grid summary-grid-five dashboard-summary-grid">
      <SummaryCard label="Income" value={summary.income} change={summary.incomeChange} tone="positive" onClick={onMajorIncomes} />
      <SummaryCard label="Spent" value={summary.expenses} change={summary.expenseChange} tone="negative" higherIsBetter={false} onClick={onMajorSpends} />
      <SummaryCard label="Saved" value={summary.savingsTransfers} change={summary.savingsChange} tone="positive" onClick={() => onBreakdown("Saved")} />
      <SummaryCard label="Available balance" value={summary.spendableBalance} tone="neutral" detail="Budget-linked accounts" onClick={() => onBreakdown("Available Balance")} />
      <SummaryCard
        label="Excluded spending"
        value={summary.excludedSpending}
        tone={summary.excludedSpending > 0 ? "warning" : "neutral"}
        detail="Not counted in budgets"
        onClick={() => onBreakdown("Excluded Spending")}
        afterValue={(
          <label className="summary-inline-toggle" title="Controls dashboard spending charts and the budget breakdown pie chart" onClick={event => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={Boolean(includeExcludedSpendingInCharts)}
              onChange={event => onIncludeExcludedSpendingChange?.(event.target.checked)}
            />
            <span>Include in charts</span>
          </label>
        )}
      />
    </div>
  );
}

function DashboardBreakdownModal({ title, rows, onClose }) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card breakdown-modal">
        <div className="section-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose}>x</button>
        </div>
        <div className="profile-meta-grid">
          {rows.map(row => (
            <p key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

function FocusPanel({ appData, actions, selectedMonth, accountId, isSavingsView }) {
  return isSavingsView ? (
    <SavingsGoalsPanel
      appData={appData}
      accountId={accountId}
      onViewAll={() => actions.setActivePage("savings")}
    />
  ) : (
    <BudgetWarningsPanel
      appData={appData}
      selectedMonth={selectedMonth}
      accountId={accountId}
      onViewAll={() => actions.setActivePage("budgets")}
    />
  );
}

export default function DashboardPage({ appData, actions }) {
  const activeAccounts = useMemo(() => (
    (appData.accounts || []).filter(account => account.isActive !== false)
  ), [appData.accounts]);

  const requestedAccountId = actions.selectedDashboardAccountId || "all";
  const selectedAccount = activeAccounts.find(account => account.id === requestedAccountId) || null;
  const selectedAccountId = selectedAccount ? requestedAccountId : "all";
  const accountIdForCalculations = selectedAccountId === "all" ? null : selectedAccountId;
  const isSavingsView = selectedAccount?.type === "savings" || selectedAccount?.type === "investment";
  const [includeExcludedSpendingInCharts, setIncludeExcludedSpendingInCharts] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [showMajorSpends, setShowMajorSpends] = useState(false);
  const [includeExcludedInMajorSpends, setIncludeExcludedInMajorSpends] = useState(false);
  const [showMajorIncomes, setShowMajorIncomes] = useState(false);
  const [includeExcludedInMajorIncomes, setIncludeExcludedInMajorIncomes] = useState(false);
  const summary = calculateMonthSummary(appData, actions.selectedMonth, {
    accountId: accountIdForCalculations,
    includeExcludedSpendingInCharts
  });
  const majorSpends = useMemo(() => getMajorSpends(appData, actions.selectedMonth, {
    accountId: accountIdForCalculations,
    includeExcluded: includeExcludedInMajorSpends
  }), [appData, actions.selectedMonth, accountIdForCalculations, includeExcludedInMajorSpends]);
  const majorSpendThreshold = Number(appData.settings?.largeExpenseThreshold || DEFAULT_LARGE_EXPENSE_THRESHOLD);
  const majorIncomes = useMemo(() => getMajorIncomes(appData, actions.selectedMonth, {
    accountId: accountIdForCalculations,
    includeExcluded: includeExcludedInMajorIncomes
  }), [appData, actions.selectedMonth, accountIdForCalculations, includeExcludedInMajorIncomes]);
  const majorIncomeThreshold = Number(appData.settings?.largeIncomeThreshold || DEFAULT_LARGE_INCOME_THRESHOLD);
  const dashboardLayout = appData.settings?.dashboardLayout || "full";

  function getBreakdownRows(title) {
    const accountLabel = selectedAccount?.name || "All accounts";
    const includedAccounts = activeAccounts
      .map(account => `${account.name}: ${formatMoney(calculateAccountBalance(appData, account.id))}`)
      .join(", ") || "No active accounts";
    const base = [
      { label: "Month", value: actions.selectedMonth },
      { label: "Account filter", value: accountLabel }
    ];
    const rows = {
      "Budget Left": [
        ...base,
        { label: "Total active budgets", value: formatMoney(summary.totalBudgetLimit) },
        { label: "Counted spending", value: formatMoney(summary.budgetCountedSpending) },
        { label: "Excluded spending", value: formatMoney(summary.excludedSpending) },
        { label: "Available linked account balance", value: formatMoney(summary.spendableBalance) },
        { label: "Raw budget left", value: formatMoney(summary.budgetLeftRaw) },
        { label: "Final displayed value", value: formatMoney(summary.moneyLeft) }
      ],
      "Income": [...base, { label: "Income rows counted", value: String(summary.monthTransactions.filter(t => t.type === "income" && !t.transferLinkId).length) }, { label: "Final income", value: formatMoney(summary.income) }],
      "Spent": [...base, { label: "Expense rows counted", value: String(summary.monthTransactions.filter(t => t.type === "expense" && !t.transferLinkId).length) }, { label: "Excluded rows", value: String(summary.monthTransactions.filter(t => t.type === "expense" && t.excludeFromBudget).length) }, { label: "Final spent", value: formatMoney(summary.expenses) }],
      "Saved": [...base, { label: "Savings transfer rows", value: String(summary.monthTransactions.filter(t => t.type === "income" && t.transferLinkId).length) }, { label: "Final saved", value: formatMoney(summary.savingsTransfers || summary.accountMoneyIn) }],
      "Available Balance": [...base, { label: "Included accounts", value: includedAccounts }, { label: "Final available balance", value: formatMoney(summary.spendableBalance) }],
      "Excluded Spending": [...base, { label: "Excluded expense rows", value: String(summary.monthTransactions.filter(t => t.type === "expense" && t.excludeFromBudget).length) }, { label: "Excluded total", value: formatMoney(summary.excludedSpending) }],
      "Carry-forward": [...base, { label: "Previous closed month record", value: summary.carryForward ? "Found" : "None" }, { label: "Carry-forward", value: formatMoney(summary.carryForward) }]
    };
    return rows[title] || base;
  }

  function openBreakdown(title) {
    setBreakdown({ title, rows: getBreakdownRows(title) });
  }

  function updateDashboardLayout(layout) {
    actions.updateAppData({
      ...appData,
      settings: {
        ...(appData.settings || {}),
        dashboardLayout: layout
      }
    }, { reason: "Dashboard layout changed" });
  }

  return (
    <div className={`page-grid dashboard-layout-${dashboardLayout}`}>
      <div className="page-title-row dashboard-title-row">
        <div>
          <div className="overview-title-wrap">
            <h2>Monthly overview for {selectedAccount?.name || "All accounts"}</h2>
          </div>
        </div>
        <div className="dashboard-display-controls">
          <MonthSelector selectedMonth={actions.selectedMonth} setSelectedMonth={actions.setSelectedMonth} />
        </div>
      </div>

      <MoneyLeftCard
        value={summary.moneyLeft}
        label={isSavingsView ? "Net saved this month" : "Budget left this month"}
        negativeLabel={isSavingsView ? "Net loss of" : "Over budget by"}
        description={!isSavingsView && summary.budgetAffordabilityWarning
          ? "Remaining budgets are close to or above the money available in the linked account(s). Consider transferring money or lowering budgets."
          : !isSavingsView
            ? `Based on active budgets minus counted spending. Capped by available account money: ${summary.spendableBalance.toLocaleString("en-GB", { style: "currency", currency: "GBP" })}.`
            : ""}
        onClick={() => openBreakdown(isSavingsView ? "Saved" : "Budget Left")}
      />

      <DashboardSummaryCards
        summary={summary}
        isSavingsView={isSavingsView}
        includeExcludedSpendingInCharts={includeExcludedSpendingInCharts}
        onIncludeExcludedSpendingChange={setIncludeExcludedSpendingInCharts}
        onBreakdown={openBreakdown}
        onMajorSpends={() => setShowMajorSpends(true)}
        onMajorIncomes={() => setShowMajorIncomes(true)}
      />

      {!isSavingsView && summary.carryForward !== 0 && (
        <button type="button" className="card compact-insight-card clickable-card" onClick={() => openBreakdown("Carry-forward")}>
          <strong>Carry-forward: {formatMoney(summary.carryForward)}</strong>
          <small>Select to see the closed-month source.</small>
        </button>
      )}

      {dashboardLayout === "simple" ? (
        <>
          <section className="card simple-layout-note">
            <div>
              <h3>Simple view</h3>
              <p className="muted-text">Charts are hidden in this layout.</p>
            </div>
            <button className="secondary-button" onClick={() => updateDashboardLayout("full")}>Switch to full dashboard</button>
          </section>

          <div className="three-column simple-dashboard-grid">
            <UpcomingBillsPanel appData={appData} accountId={accountIdForCalculations} />
            <RecentTransactionsPanel appData={appData} accountId={accountIdForCalculations} onEdit={actions.openEditTransaction} />
            <FocusPanel
              appData={appData}
              actions={actions}
              selectedMonth={actions.selectedMonth}
              accountId={accountIdForCalculations}
              isSavingsView={isSavingsView}
            />
          </div>
        </>
      ) : (
        <>
          <div className="two-column">
            <SpendingComparisonChart summary={summary} />
            <MoneyBreakdownPie summary={summary} includeExcludedSpending={includeExcludedSpendingInCharts} />
          </div>

          {dashboardLayout === "full" && (
            <MonthlySpendingTrendChart comparison={summary.dailySpendingComparison} />
          )}

          <div className={dashboardLayout === "compact" ? "two-column compact-dashboard-grid" : "three-column"}>
            <UpcomingBillsPanel appData={appData} accountId={accountIdForCalculations} />
            <RecentTransactionsPanel appData={appData} accountId={accountIdForCalculations} onEdit={actions.openEditTransaction} />
            {dashboardLayout === "full" && (
              <FocusPanel
                appData={appData}
                actions={actions}
                selectedMonth={actions.selectedMonth}
                accountId={accountIdForCalculations}
                isSavingsView={isSavingsView}
              />
            )}
          </div>

          {dashboardLayout === "compact" && (
            <FocusPanel
              appData={appData}
              actions={actions}
              selectedMonth={actions.selectedMonth}
              accountId={accountIdForCalculations}
              isSavingsView={isSavingsView}
            />
          )}
        </>
      )}
      {breakdown && <DashboardBreakdownModal title={breakdown.title} rows={breakdown.rows} onClose={() => setBreakdown(null)} />}
      {showMajorSpends && (
        <MajorSpendsModal
          appData={appData}
          spends={majorSpends}
          threshold={majorSpendThreshold}
          includeExcluded={includeExcludedInMajorSpends}
          onIncludeExcludedChange={setIncludeExcludedInMajorSpends}
          onEdit={transaction => {
            setShowMajorSpends(false);
            actions.openEditTransaction(transaction);
          }}
          onClose={() => setShowMajorSpends(false)}
        />
      )}
      {showMajorIncomes && (
        <MajorSpendsModal
          kind="incomes"
          appData={appData}
          spends={majorIncomes}
          threshold={majorIncomeThreshold}
          includeExcluded={includeExcludedInMajorIncomes}
          onIncludeExcludedChange={setIncludeExcludedInMajorIncomes}
          onEdit={transaction => {
            setShowMajorIncomes(false);
            actions.openEditTransaction(transaction);
          }}
          onShowBreakdown={() => {
            setShowMajorIncomes(false);
            openBreakdown("Income");
          }}
          onClose={() => setShowMajorIncomes(false)}
        />
      )}
    </div>
  );
}
