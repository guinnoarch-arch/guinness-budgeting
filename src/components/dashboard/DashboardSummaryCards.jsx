import SummaryCard from "./SummaryCard.jsx";

export function DashboardSummaryCards({ summary, isSavingsView, includeExcludedSpendingInCharts, onIncludeExcludedSpendingChange, onBreakdown, onMajorSpends, onMajorIncomes }) {
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
