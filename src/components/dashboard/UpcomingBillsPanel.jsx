import { normaliseAccountFilter } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";

export default function UpcomingBillsPanel({ appData, accountId = null }) {
  const selectedAccountId = normaliseAccountFilter(accountId);
  const today = new Date();
  const limit = new Date();
  limit.setDate(today.getDate() + 7);

  const upcoming = appData.recurringItems
    .filter(item => item.isActive !== false && item.reminderEnabled !== false)
    .filter(item => !selectedAccountId || item.accountId === selectedAccountId)
    .filter(item => {
      const due = new Date(item.nextDueDate);
      return due >= today && due <= limit;
    })
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  return (
    <section className="card">
      <h3>Upcoming bills</h3>
      {upcoming.length === 0 ? (
        <p className="muted">No bills due in the next 7 days for this account view.</p>
      ) : (
        <div className="stack">
          {upcoming.map(item => (
            <div key={item.id} className="bill-row">
              <span>
                <strong>{item.name}</strong>
                <small>{item.nextDueDate} · {item.amountType}</small>
              </span>
              <strong>{formatMoney(item.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
