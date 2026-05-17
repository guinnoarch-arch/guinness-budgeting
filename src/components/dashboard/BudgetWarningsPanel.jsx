import { getCategorySpend } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";

function getBudgetTone(item, thresholds) {
  if (item.usedPercent > thresholds.orangeMax) return "red";
  if (item.usedPercent >= thresholds.greenMax) return "orange";
  return "green";
}

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
          <p className="muted-text">All category budgets for this month and account view.</p>
        </div>
        <button className="text-button" onClick={onViewAll}>Manage budgets</button>
      </div>

      {budgetItems.length === 0 ? (
        <p className="muted">No category budgets set for this month.</p>
      ) : (
        <div className="stack budget-warning-stack">
          {budgetItems.map(item => {
            const tone = getBudgetTone(item, thresholds);
            const remainingText = item.remaining >= 0
              ? `${formatMoney(item.remaining)} left`
              : `${formatMoney(Math.abs(item.remaining))} over`;

            return (
              <div key={item.category.id} className={`warning-row ${tone}`}>
                <div>
                  <strong>{item.category.name}</strong>
                  <small>{formatMoney(item.spent)} spent of {formatMoney(item.limit)}</small>
                </div>
                <span>{item.usedPercent.toFixed(0)}% used · {remainingText}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
