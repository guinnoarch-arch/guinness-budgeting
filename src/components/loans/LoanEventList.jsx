import { formatMoney } from "../../utils/money.js";
import { formatEventType } from "./loanDisplay.js";

export function LoanEventList({ events }) {
  return (
    <div className="loan-event-list">
      <div className="section-header compact-header">
        <div>
          <h4>Loan event history</h4>
        </div>
        <span className="pill">{events.length} event(s)</span>
      </div>
      {events.length === 0 ? (
        <p className="muted">No loan events yet. Link a transaction to this loan or add a manual balance update.</p>
      ) : (
        <div className="loan-event-table-wrap">
          <table className="loan-event-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Payment</th>
                <th>Interest</th>
                <th>Capital</th>
                <th>Overpayment</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.id || `${event.date}-${event.type}-${event.note}`}>
                  <td>{event.date || "—"}</td>
                  <td><span className={`pill ${event.type === "overpayment" ? "warning" : event.type === "balanceAdjustment" ? "transfer" : ""}`}>{formatEventType(event.type)}</span></td>
                  <td>{event.paymentAmount !== undefined ? formatMoney(event.paymentAmount) : "—"}</td>
                  <td>{event.interestAmount !== undefined ? formatMoney(event.interestAmount) : "—"}</td>
                  <td>{event.principalAmount !== undefined ? formatMoney(event.principalAmount) : event.amount !== undefined ? formatMoney(Math.abs(Number(event.amount || 0))) : "—"}</td>
                  <td>{Number(event.overpaymentAmount || 0) > 0 ? formatMoney(event.overpaymentAmount) : "—"}</td>
                  <td><small>{event.note || event.source || "—"}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
