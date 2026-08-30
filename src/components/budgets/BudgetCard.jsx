import { formatMoney } from "../../utils/money.js";

export default function BudgetCard({
  item,
  recentTransactions,
  isOpen,
  onToggle,
  onEditBudget,
  onEditCategory,
  onEditTransaction
}) {
  const capped = Math.min(item.usedPercent, 100);
  const tone = item.limit === 0 ? "" : item.usedPercent > 100 ? "red" : item.usedPercent >= 75 ? "orange" : "green";
  const accountsLabel = (item.accounts && item.accounts.length > 0)
    ? item.accounts.map(account => account.name).join(", ")
    : item.account?.name || "";

  return (
    <section className={`budget-card ${tone}`}>
      <button type="button" className="budget-card-header" onClick={onToggle} aria-expanded={isOpen}>
        <div>
          <strong>{item.category.name.toUpperCase()}</strong>
          <small>{accountsLabel ? `${accountsLabel} · ` : ""}{item.limit ? `${formatMoney(item.remaining)} left` : "No budget set"}</small>
        </div>
        <div className="budget-card-header-right">
          <span>{formatMoney(item.spent)} / {item.limit ? formatMoney(item.limit) : "No limit"}</span>
          <small>{isOpen ? "Hide" : "View"}</small>
        </div>
      </button>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${capped}%` }} />
      </div>

      {isOpen && (
        <div className="budget-expanded">
          <div className="budget-detail-grid">
            <p>Budget-counted spend: <strong>{formatMoney(item.spent)}</strong></p>
            <p>Excluded spend: <strong>{formatMoney(item.excludedSpent || 0)}</strong></p>
            <p>Total category spend: <strong>{formatMoney(item.totalSpent ?? item.spent)}</strong></p>
            <p>Budget: <strong>{item.limit ? formatMoney(item.limit) : "No budget"}</strong></p>
            <p>Linked account{(item.accounts?.length || 0) > 1 ? "s" : ""}: <strong>{accountsLabel || "All accounts"}</strong></p>
            <p>Used: <strong>{item.limit ? `${item.usedPercent.toFixed(0)}%` : "-"}</strong></p>
          </div>

          <div className="section-header compact-header budget-transactions-heading">
            <div>
              <h4>Recent spending</h4>
              <p className="muted-text">Scroll this list to review and edit spending without leaving Budgets.</p>
            </div>
          </div>

          {recentTransactions.length === 0 ? (
            <p className="muted">No recent spending in this category.</p>
          ) : (
            <div className="budget-transaction-scroll" role="region" aria-label={`${item.category.name} transactions`}>
              {recentTransactions.map(txn => (
                <div key={txn.id} className="simple-row budget-transaction-row">
                  <div>
                    <span>{txn.title}</span>
                    <small>{txn.date}{txn.excludeFromBudget ? " · Excluded" : ""}</small>
                  </div>
                  <div className="row-actions budget-transaction-actions">
                    <strong>{formatMoney(txn.amount)}</strong>
                    <button type="button" className="text-button" onClick={() => onEditTransaction?.(txn)}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="row-actions budget-card-actions">
            <button type="button" className="secondary-button" onClick={() => onEditBudget(item)}>Edit budget</button>
            <button type="button" className="secondary-button" onClick={() => onEditCategory(item.category)}>Edit category</button>
          </div>
        </div>
      )}
    </section>
  );
}
