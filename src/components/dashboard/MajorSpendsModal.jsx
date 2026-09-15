import { getCategoryById } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";

export default function MajorSpendsModal({ appData, spends, threshold, includeExcluded, onIncludeExcludedChange, onEdit, onClose }) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card breakdown-modal">
        <div className="section-header">
          <h2>Major spends this month</h2>
          <button type="button" className="icon-button" onClick={onClose}>x</button>
        </div>
        <p className="muted-text">Expenses of {formatMoney(threshold, false)} or more.</p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(includeExcluded)}
            onChange={event => onIncludeExcludedChange(event.target.checked)}
          />
          <span>Include excluded &amp; ruled-out spending</span>
        </label>
        {spends.length === 0 ? (
          <p className="muted-text">No major spends found for this view.</p>
        ) : (
          <div className="stack">
            {spends.map(transaction => {
              const category = getCategoryById(appData.categories || [], transaction.categoryId);
              return (
                <button key={transaction.id} className="transaction-mini-row" onClick={() => onEdit(transaction)}>
                  <span>
                    <strong>{transaction.title}</strong>
                    <small>{transaction.date}{category ? ` · ${category.name}` : ""}</small>
                  </span>
                  <span className="amount expense">{formatMoney(transaction.amount)}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
