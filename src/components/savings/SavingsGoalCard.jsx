import { useState } from "react";
import { getSavingsGoalProgress } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";

export default function SavingsGoalCard({ appData, goal }) {
  const [open, setOpen] = useState(false);
  const progress = getSavingsGoalProgress(appData, goal);
  const percent = Math.min(progress.percent, 100);

  const linkedTransfers = appData.transactions
    .filter(txn => txn.type === "transfer" && txn.linkedSavingsGoalId === goal.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="budget-card green">
      <button className="budget-card-header" onClick={() => setOpen(prev => !prev)}>
        <div>
          <strong>{goal.name.toUpperCase()}</strong>
          <small>{formatMoney(progress.remaining)} left</small>
        </div>
        <span>{formatMoney(progress.saved)} / {formatMoney(goal.targetAmount)}</span>
      </button>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>

      {open && (
        <div className="budget-expanded">
          <p>Saved: <strong>{formatMoney(progress.saved)}</strong></p>
          <p>Target: <strong>{formatMoney(goal.targetAmount)}</strong></p>
          <p>Progress: <strong>{progress.percent.toFixed(0)}%</strong></p>

          <h4>Recent contributions</h4>
          {linkedTransfers.length === 0 ? (
            <p className="muted">No linked transfers yet.</p>
          ) : linkedTransfers.map(txn => (
            <div key={txn.id} className="simple-row">
              <span>{txn.title}</span>
              <strong>{formatMoney(txn.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
