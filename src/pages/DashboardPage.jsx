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
import { calculateMonthSummary } from "../utils/calculations.js";

function DashboardSummaryCards({ summary, isSavingsView, includeExcludedSpendingInCharts, onIncludeExcludedSpendingChange }) {
  if (isSavingsView) {
    return (
      <div className="summary-grid summary-grid-two dashboard-summary-grid">
        <SummaryCard label="Saved" value={summary.accountMoneyIn} change={summary.accountMoneyInChange} tone="positive" />
        <SummaryCard label="Spent" value={summary.accountMoneyOut} change={summary.accountMoneyOutChange} tone="negative" />
      </div>
    );
  }

  return (
    <div className="summary-grid summary-grid-five dashboard-summary-grid">
      <SummaryCard label="Income" value={summary.income} change={summary.incomeChange} tone="positive" />
      <SummaryCard label="Spent" value={summary.expenses} change={summary.expenseChange} tone="negative" />
      <SummaryCard label="Saved" value={summary.savingsTransfers} change={summary.savingsChange} tone="positive" />
      <SummaryCard label="Available balance" value={summary.spendableBalance} tone="neutral" detail="Budget-linked accounts" />
      <SummaryCard
        label="Excluded spending"
        value={summary.excludedSpending}
        tone={summary.excludedSpending > 0 ? "warning" : "neutral"}
        detail="Not counted in budgets"
        afterValue={(
          <label className="summary-inline-toggle" title="Controls dashboard spending charts and the budget breakdown pie chart">
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
  const isSavingsView = selectedAccount?.type === "savings";
  const [includeExcludedSpendingInCharts, setIncludeExcludedSpendingInCharts] = useState(false);
  const summary = calculateMonthSummary(appData, actions.selectedMonth, {
    accountId: accountIdForCalculations,
    includeExcludedSpendingInCharts
  });
  const dashboardLayout = appData.settings?.dashboardLayout || "full";

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
      />

      <DashboardSummaryCards
        summary={summary}
        isSavingsView={isSavingsView}
        includeExcludedSpendingInCharts={includeExcludedSpendingInCharts}
        onIncludeExcludedSpendingChange={setIncludeExcludedSpendingInCharts}
      />

      {dashboardLayout === "simple" ? (
        <>
          <section className="card simple-layout-note">
            <div>
              <h3>Simple view</h3>
              <p className="muted-text">Charts are hidden in this layout. Use it when you only want the main cash position, upcoming bills, and the latest transactions.</p>
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
    </div>
  );
}
