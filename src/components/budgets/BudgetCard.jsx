import { useState } from "react";
import { formatMoney } from "../../utils/money.js";

export default function BudgetCard({ item, recentTransactions, onEditBudget, onEditCategory, onArchiveBudget }) {
  const [open, setOpen] = useState(false);
  const capped = Math.min(item.usedPercent, 100);
  const tone = item.limit === 0 ? "" : item.usedPercent > 100 ? "red" : item.usedPercent >= 75 ? "orange" : "green";

  return (
    <section className={`budget-card ${tone}`}>
      <button className="budget-card-header" onClick={() => setOpen(prev => !prev)}>
        <div>
          <strong>{item.category.name.toUpperCase()}</strong>
          <small>{item.account?.name ? `${item.account.name} · ` : ""}{item.limit ? `${formatMoney(item.remaining)} left` : "No budget set"}</small>
        </div>
        <div>
          <span>{formatMoney(item.spent)} / {item.limit ? formatMoney(item.limit) : "No limit"}</span>
        </div>
      </button>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${capped}%` }} />
      </div>

      {open && (
        <div className="budget-expanded">
          <p>Spent: <strong>{formatMoney(item.spent)}</strong></p>
          <p>Budget: <strong>{item.limit ? formatMoney(item.limit) : "No budget"}</strong></p>
          <p>Linked account: <strong>{item.account?.name || "All accounts"}</strong></p>
          <p>Used: <strong>{item.limit ? `${item.usedPercent.toFixed(0)}%` : "-"}</strong></p>

          <h4>Recent spending</h4>
          {recentTransactions.length === 0 ? (
            <p className="muted">No recent spending in this category.</p>
          ) : (
            recentTransactions.slice(0, 5).map(txn => (
              <div key={txn.id} className="simple-row">
                <span>{txn.title}</span>
                <strong>{formatMoney(txn.amount)}</strong>
              </div>
            ))
          )}

          <div className="row-actions">
            <button className="secondary-button" onClick={() => onEditBudget(item)}>Edit budget</button>
            {item.budget && (
              <button className="danger-button" onClick={() => onArchiveBudget(item)}>Archive budget</button>
            )}
            <button className="secondary-button" onClick={() => onEditCategory(item.category)}>Edit category</button>
          </div>
        </div>
      )}
    </section>
  );
}
