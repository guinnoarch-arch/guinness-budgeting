import { getCategoryById } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";
import { formatDisplayDate } from "../../utils/dates.js";

// Shared by the Spent card (major spends) and the Income card (big incomes):
// every transaction at or above the relevant threshold this month, biggest
// first. `kind` switches the wording and colours; onShowBreakdown, if given,
// adds a link to the card's full figures breakdown.
export default function MajorSpendsModal({ appData, spends, threshold, includeExcluded, onIncludeExcludedChange, onEdit, onClose, kind = "spends", onShowBreakdown = null }) {
  const isIncome = kind === "incomes";
  const total = spends.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  return (
    <div className="modal-backdrop">
      <section className="modal-card breakdown-modal">
        <div className="section-header">
          <h2>{isIncome ? "Big incomes this month" : "Major spends this month"}</h2>
          <button type="button" className="icon-button" onClick={onClose}>x</button>
        </div>
        <p className="muted-text">
          {isIncome ? "Income" : "Expenses"} of {formatMoney(threshold, false)} or more
          {isIncome ? " (transfers between your own accounts aren't included)" : ""}.
          {spends.length > 0 ? ` ${spends.length} item${spends.length === 1 ? "" : "s"}, ${formatMoney(total)} in total.` : ""}
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(includeExcluded)}
            onChange={event => onIncludeExcludedChange(event.target.checked)}
          />
          <span>{isIncome ? "Include income excluded from totals" : "Include excluded & ruled-out spending"}</span>
        </label>
        {spends.length === 0 ? (
          <p className="muted-text">{isIncome ? "No big incomes found for this view." : "No major spends found for this view."}</p>
        ) : (
          <div className="stack">
            {spends.map(transaction => {
              const category = getCategoryById(appData.categories || [], transaction.categoryId);
              return (
                <button key={transaction.id} className="transaction-mini-row" onClick={() => onEdit(transaction)}>
                  <span>
                    <strong>{transaction.title}</strong>
                    <small>{formatDisplayDate(transaction.date)}{category ? ` · ${category.name}` : ""}</small>
                  </span>
                  <span className={`amount ${isIncome ? "income" : "expense"}`}>{formatMoney(transaction.amount)}</span>
                </button>
              );
            })}
          </div>
        )}
        {onShowBreakdown && (
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onShowBreakdown}>
              {isIncome ? "Full income breakdown" : "Full breakdown"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
