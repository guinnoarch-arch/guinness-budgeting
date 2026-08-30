import { getSavingsGoalProgress } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";

function goalTouchesAccount(appData, goalId, accountId) {
  return appData.transactions.some(transaction => (
    transaction.linkedSavingsGoalId === goalId && transaction.accountId === accountId
  ));
}

export default function SavingsGoalsPanel({ appData, accountId = null, onViewAll }) {
  const goals = appData.savingsGoals
    .filter(goal => goal.isActive !== false)
    .filter(goal => {
      if (!accountId) return true;
      if (goal.linkedAccountId === accountId) return true;
      return goalTouchesAccount(appData, goal.id, accountId);
    })
    .map(goal => ({ goal, progress: getSavingsGoalProgress(appData, goal) }))
    .sort((a, b) => b.progress.percent - a.progress.percent);

  return (
    <section className="card dashboard-savings-goals-panel">
      <div className="section-header">
        <div>
          <h3>Savings goals</h3>
          <p className="muted-text">
            {accountId ? "Goals linked to this savings account." : "All active savings goals."}
          </p>
        </div>
        <button className="text-button" onClick={onViewAll}>Manage goals</button>
      </div>

      {goals.length === 0 ? (
        <p className="muted">
          {accountId
            ? "No savings goals linked to this savings account yet."
            : "No savings goals set yet."}
        </p>
      ) : (
        <div className="stack savings-goal-stack">
          {goals.map(({ goal, progress }) => {
            const percent = Math.min(progress.percent, 100);
            const remainingText = progress.remaining > 0
              ? `${formatMoney(progress.remaining)} left`
              : "Target reached";

            return (
              <div key={goal.id} className="saving-goal-row">
                <div className="saving-goal-row-main">
                  <div>
                    <strong>{goal.name}</strong>
                    <small>{formatMoney(progress.saved)} saved of {formatMoney(goal.targetAmount)}</small>
                  </div>
                  <span>{progress.percent.toFixed(0)}% · {remainingText}</span>
                </div>
                <div className="saving-goal-progress-track">
                  <div className="saving-goal-progress-fill" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
