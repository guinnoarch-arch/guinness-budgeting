// Display rows for recurring payments and bills.
import { formatMoney } from "../../utils/money.js";
import { formatDisplayDate } from "../../utils/dates.js";

export function RecurringPaymentCard({ item, archived = false, onEdit, onArchive, onRestore, onDelete }) {
  return (
    <div className={`sub-card recurring-payment-card ${archived ? "archived-card" : ""}`}>
      <div className="recurring-card-main">
        <strong>{item.name}</strong>
        <p>{formatMoney(item.amount)} · {item.amountType || "fixed"} · {formatFrequency(item.frequency)}</p>
        <p>Next due: {item.nextDueDate ? formatDisplayDate(item.nextDueDate) : "Not set"}</p>
        {archived && <p className="muted-text">Archived {item.archivedAt ? formatDisplayDate(item.archivedAt) : ""}</p>}
      </div>

      <div className="recurring-card-actions">
        <span className="pill">{item.autoAdd ? "Auto-add" : "Confirm"}</span>
        {archived ? (
          <>
            <button className="secondary-button" type="button" onClick={() => onRestore(item)}>Restore</button>
            <button className="danger-button" type="button" onClick={() => onDelete(item)}>Delete permanently</button>
          </>
        ) : (
          <>
            <button className="secondary-button" type="button" onClick={() => onEdit(item)}>Edit</button>
            <button className="danger-button" type="button" onClick={() => onArchive(item)}>Archive</button>
          </>
        )}
      </div>
    </div>
  );
}

export function BillRow({ item }) {
  return (
    <div className="simple-row">
      <span>
        <strong>{item.name}</strong>
        <small>{formatDisplayDate(item.nextDueDate)}</small>
      </span>
      <strong>{formatMoney(item.amount)}</strong>
    </div>
  );
}

function formatFrequency(frequency) {
  return String(frequency || "monthly").replaceAll("_", " ");
}
