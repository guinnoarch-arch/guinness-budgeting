import { useMemo, useState } from "react";
import SavingsGoalCard from "../components/savings/SavingsGoalCard.jsx";
import { generateId } from "../utils/ids.js";

const blankGoalForm = {
  name: "",
  targetAmount: "",
  currentManualAmount: "",
  linkedAccountId: "",
  targetDate: ""
};

export default function SavingsPage({ appData, actions }) {
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState(blankGoalForm);

  const goals = appData.savingsGoals.filter(goal => goal.isActive);
  const savingsAccounts = useMemo(() => (
    appData.accounts.filter(account => account.isActive && account.type === "savings")
  ), [appData.accounts]);

  function updateGoalForm(field, value) {
    setGoalForm(prev => ({ ...prev, [field]: value }));
  }

  function openAddGoalModal() {
    setGoalForm({
      ...blankGoalForm,
      linkedAccountId: savingsAccounts[0]?.id || ""
    });
    setShowGoalModal(true);
  }

  function closeGoalModal() {
    setShowGoalModal(false);
    setGoalForm(blankGoalForm);
  }

  function submitGoal(event) {
    event.preventDefault();

    const name = goalForm.name.trim();
    const targetAmount = Number(goalForm.targetAmount);
    const currentManualAmount = Number(goalForm.currentManualAmount || 0);

    if (!name) return alert("Enter a savings goal name.");
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) return alert("Enter a target amount above zero.");
    if (!Number.isFinite(currentManualAmount) || currentManualAmount < 0) return alert("Starting saved amount cannot be negative.");

    const now = new Date().toISOString();
    const newGoal = {
      id: generateId("goal"),
      name,
      targetAmount,
      currentManualAmount,
      linkedAccountId: goalForm.linkedAccountId || null,
      targetDate: goalForm.targetDate || null,
      isActive: true,
      isExample: false,
      createdAt: now,
      updatedAt: now
    };

    actions.updateAppData(prev => ({
      ...prev,
      savingsGoals: [...prev.savingsGoals, newGoal]
    }));

    closeGoalModal();
  }

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Savings</p>
          <h2>Savings goals</h2>
        </div>
        <button type="button" className="primary-button" onClick={openAddGoalModal}>+ Add savings goal</button>
      </div>

      {goals.length === 0 ? (
        <section className="card empty-state-card">
          <h3>No savings goals yet</h3>
          <p className="muted">Add a goal for something like a holiday, car fund, emergency fund, or house deposit.</p>
          <button type="button" className="secondary-button" onClick={openAddGoalModal}>Add first goal</button>
        </section>
      ) : (
        <div className="budget-grid">
          {goals.map(goal => <SavingsGoalCard key={goal.id} appData={appData} goal={goal} />)}
        </div>
      )}

      {showGoalModal && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submitGoal}>
            <div className="section-header">
              <h2>Add savings goal</h2>
              <button type="button" className="icon-button" onClick={closeGoalModal}>×</button>
            </div>

            <div className="form-grid">
              <label>
                Goal name
                <input
                  placeholder="Holiday"
                  value={goalForm.name}
                  onChange={event => updateGoalForm("name", event.target.value)}
                />
              </label>

              <label>
                Target amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="800.00"
                  value={goalForm.targetAmount}
                  onChange={event => updateGoalForm("targetAmount", event.target.value)}
                />
              </label>

              <label>
                Already saved
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={goalForm.currentManualAmount}
                  onChange={event => updateGoalForm("currentManualAmount", event.target.value)}
                />
              </label>

              <label>
                Target date
                <input
                  type="date"
                  value={goalForm.targetDate}
                  onChange={event => updateGoalForm("targetDate", event.target.value)}
                />
              </label>

              <label className="full-width">
                Linked savings account
                <select
                  value={goalForm.linkedAccountId}
                  onChange={event => updateGoalForm("linkedAccountId", event.target.value)}
                >
                  <option value="">None</option>
                  {savingsAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                <small>Transfers into this account can still be linked to this goal from the add transaction form.</small>
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeGoalModal}>Cancel</button>
              <button className="primary-button">Add goal</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
