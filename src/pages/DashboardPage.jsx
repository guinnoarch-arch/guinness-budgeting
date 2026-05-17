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
import { getBackupReminder } from "../services/storageService.js";

export default function DashboardPage({ appData, actions }) {
  const activeAccounts = useMemo(() => (
    appData.accounts.filter(account => account.isActive)
  ), [appData.accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const accountIdForCalculations = selectedAccountId === "all" ? null : selectedAccountId;
  const selectedAccount = activeAccounts.find(account => account.id === selectedAccountId) || null;
  const isSavingsView = selectedAccount?.type === "savings";
  const summary = calculateMonthSummary(appData, actions.selectedMonth, { accountId: accountIdForCalculations });
  const backupReminder = getBackupReminder(appData.settings?.lastBackupAt);
  const showBackupReminder = backupReminder.level === "warning" || backupReminder.level === "danger";

  return (
    <div className="page-grid">
      <div className="page-title-row dashboard-title-row">
        <div>
          <p className="eyebrow">Dashboard</p>
          <div className="overview-title-wrap">
            <h2>Monthly overview for</h2>
            <select
              className="inline-account-select"
              value={selectedAccountId}
              onChange={event => setSelectedAccountId(event.target.value)}
              aria-label="Dashboard account filter"
            >
              <option value="all">All accounts</option>
              {activeAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </div>
        </div>
        <MonthSelector selectedMonth={actions.selectedMonth} setSelectedMonth={actions.setSelectedMonth} />
      </div>

      {showBackupReminder && (
        <section className={`dashboard-backup-reminder ${backupReminder.level}`}>
          <div>
            <strong>{backupReminder.title}</strong>
            <span>{backupReminder.message}</span>
          </div>
          <button className="secondary-button" onClick={actions.backupNow}>Backup Now</button>
        </section>
      )}

      <MoneyLeftCard
        value={summary.moneyLeft}
        label={isSavingsView ? "Net saved this month" : "Money left this month"}
        negativeLabel={isSavingsView ? "Net loss of" : "Overspent by"}
      />

      {isSavingsView ? (
        <div className="summary-grid summary-grid-two">
          <SummaryCard label="Saved" value={summary.accountMoneyIn} change={summary.accountMoneyInChange} tone="positive" />
          <SummaryCard label="Spent" value={summary.accountMoneyOut} change={summary.accountMoneyOutChange} tone="negative" />
        </div>
      ) : (
        <div className="summary-grid summary-grid-three">
          <SummaryCard label="Income" value={summary.income} change={summary.incomeChange} tone="positive" />
          <SummaryCard label="Spent" value={summary.expenses} change={summary.expenseChange} tone="negative" />
          <SummaryCard label="Saved" value={summary.savingsTransfers} change={summary.savingsChange} tone="positive" />
        </div>
      )}

      <div className="two-column">
        <SpendingComparisonChart summary={summary} />
        <MoneyBreakdownPie summary={summary} />
      </div>

      <MonthlySpendingTrendChart comparison={summary.dailySpendingComparison} />

      <div className="three-column">
        <UpcomingBillsPanel appData={appData} accountId={accountIdForCalculations} />
        <RecentTransactionsPanel appData={appData} accountId={accountIdForCalculations} onEdit={actions.openEditTransaction} />
        {isSavingsView ? (
          <SavingsGoalsPanel
            appData={appData}
            accountId={accountIdForCalculations}
            onViewAll={() => actions.setActivePage("savings")}
          />
        ) : (
          <BudgetWarningsPanel
            appData={appData}
            selectedMonth={actions.selectedMonth}
            accountId={accountIdForCalculations}
            onViewAll={() => actions.setActivePage("budgets")}
          />
        )}
      </div>
    </div>
  );
}
