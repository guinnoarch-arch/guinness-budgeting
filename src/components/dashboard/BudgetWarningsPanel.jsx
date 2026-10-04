import { getCategorySpend } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";
import { describeBudgetStatus } from "../../utils/budgetStatus.js";

export default function BudgetWarningsPanel({ appData, selectedMonth, accountId = null, onViewAll }) {
  const thresholds = appData.settings?.budgetWarningThresholds || { greenMax: 75, orangeMax: 100 };
  const budgetItems = getCategorySpend(appData, selectedMonth, accountId)
    .filter(item => item.limit > 0)
    .sort((a, b) => b.usedPercent - a.usedPercent);

  return (
    <section className="card dashboard-budget-panel">
      <div className="section-header">
        <div>
          <h3>Budget warnings</h3>
        </div>
        <button className="text-button" onClick={onViewAll}>Manage budgets</button>
      </div>

      {budgetItems.length === 0 ? (
        <p className="muted">No category budgets set for this month.</p>
      ) : (
        <div className="stack budget-warning-stack" tabIndex={0} role="region" aria-label="Budget warnings list">
          {budgetItems.map(item => {
            const { tone, label, remainingText } = describeBudgetStatus(item, thresholds);

            return (
              <div key={item.category.id} className={`warning-row ${tone}`}>
                <div>
                  <strong>{item.category.name}</strong>
                  <small>{formatMoney(item.spent)} spent of {formatMoney(item.limit)}</small>
                </div>
                <span>
                  <span className={`budget-status-label ${tone}`}>{label}</span>
                  {item.usedPercent.toFixed(0)}% used · {remainingText}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
