import { useEffect, useMemo, useState } from "react";
import SavingsGoalCard from "../components/savings/SavingsGoalCard.jsx";
import { createId } from "../utils/ids.js";
import { formatMoney } from "../utils/money.js";
import { checkMoneyAmount, checkRequiredText, collectErrors } from "../utils/validation.js";
import useFormErrors from "../hooks/useFormErrors.js";
import { ErrorSummary, FieldError, RequiredMark } from "../components/common/FormFeedback.jsx";
import { X } from "lucide-react";
import { formatDisplayDate } from "../utils/dates.js";

const blankGoalForm = {
  name: "",
  targetAmount: "",
  currentManualAmount: "",
  linkedAccountId: "",
  targetDate: ""
};

function validateGoalForm(values) {
  return collectErrors({
    name: checkRequiredText(values.name, "a name for the goal, for example Holiday"),
    targetAmount: checkMoneyAmount(values.targetAmount, { example: "800" }),
    currentManualAmount: checkMoneyAmount(values.currentManualAmount, { required: false, allowZero: true, example: "150" })
  });
}

function isGoalArchived(goal) {
  return goal.isActive === false || goal.isArchived || goal.archivedAt;
}

export default function SavingsPage({ appData, actions }) {
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [goalForm, setGoalForm] = useState(blankGoalForm);
  const { errors, getFieldId, validateAll, validateFieldOnBlur, clearFixedErrors, resetErrors, fieldProps } = useFormErrors("goal", validateGoalForm);

  useEffect(() => {
    clearFixedErrors(goalForm);
    // Only re-check when the form values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalForm]);

  const goals = appData.savingsGoals.filter(goal => !isGoalArchived(goal));
  const archivedGoals = appData.savingsGoals
    .filter(isGoalArchived)
    .sort((a, b) => String(b.archivedAt || b.updatedAt || "").localeCompare(String(a.archivedAt || a.updatedAt || "")));

  const savingsAccounts = useMemo(() => (
    appData.accounts.filter(account => account.isActive !== false && (account.type === "savings" || account.type === "investment"))
  ), [appData.accounts]);

  function updateGoalForm(field, value) {
    setGoalForm(prev => ({ ...prev, [field]: value }));
  }

  function openAddGoalModal() {
    setEditingGoalId(null);
    setGoalForm({
      ...blankGoalForm,
      linkedAccountId: savingsAccounts[0]?.id || ""
    });
    setShowGoalModal(true);
  }

  function openEditGoalModal(goal) {
    setEditingGoalId(goal.id);
    setGoalForm({
      name: goal.name || "",
      targetAmount: String(goal.targetAmount ?? ""),
      currentManualAmount: String(goal.currentManualAmount ?? ""),
      linkedAccountId: goal.linkedAccountId || "",
      targetDate: goal.targetDate || ""
    });
    setShowGoalModal(true);
  }

  function closeGoalModal() {
    setShowGoalModal(false);
    setEditingGoalId(null);
    setGoalForm(blankGoalForm);
    resetErrors();
  }

  function submitGoal(event) {
    event.preventDefault();

    const name = goalForm.name.trim();
    const targetAmount = Number(goalForm.targetAmount);
    const currentManualAmount = Number(goalForm.currentManualAmount || 0);

    if (!validateAll(goalForm)) return;

    const now = new Date().toISOString();

    if (editingGoalId) {
      actions.updateAppData(prev => ({
        ...prev,
        savingsGoals: prev.savingsGoals.map(goal => (
          goal.id === editingGoalId
            ? {
                ...goal,
                name,
                targetAmount,
                currentManualAmount,
                linkedAccountId: goalForm.linkedAccountId || null,
                targetDate: goalForm.targetDate || null,
                isActive: true,
                isArchived: false,
                archivedAt: null,
                updatedAt: now
              }
            : goal
        ))
      }), { reason: "Savings goal edited" });
      closeGoalModal();
      return;
    }

    const newGoal = {
      id: createId("goal"),
      name,
      targetAmount,
      currentManualAmount,
      linkedAccountId: goalForm.linkedAccountId || null,
      targetDate: goalForm.targetDate || null,
      isActive: true,
      isArchived: false,
      archivedAt: null,
      isExample: false,
      createdAt: now,
      updatedAt: now
    };

    actions.updateAppData(prev => ({
      ...prev,
      savingsGoals: [...prev.savingsGoals, newGoal]
    }), { reason: "Savings goal added" });

    closeGoalModal();
  }

  function archiveGoal(goal) {
    if (!confirm(`Archive the ${goal.name} savings goal? Linked transfer history will stay in the app.`)) return;
    const now = new Date().toISOString();
    actions.updateAppData(prev => ({
      ...prev,
      savingsGoals: prev.savingsGoals.map(item => (
        item.id === goal.id
          ? { ...item, isActive: false, isArchived: true, archivedAt: now, updatedAt: now }
          : item
      ))
    }), { reason: "Savings goal archived" });
  }

  function restoreGoal(goal) {
    const now = new Date().toISOString();
    actions.updateAppData(prev => ({
      ...prev,
      savingsGoals: prev.savingsGoals.map(item => (
        item.id === goal.id
          ? { ...item, isActive: true, isArchived: false, archivedAt: null, updatedAt: now }
          : item
      ))
    }), { reason: "Savings goal restored" });
  }

  function permanentlyDeleteGoal(goal) {
    const linkedCount = appData.transactions.filter(txn => txn.linkedSavingsGoalId === goal.id).length;
    const detail = linkedCount > 0
      ? `\n\n${linkedCount} linked transfer(s) will stay in Transactions, but their savings-goal link will be removed.`
      : "";
    if (!confirm(`Permanently delete the archived ${goal.name} savings goal? This cannot be undone.${detail}`)) return;

    actions.updateAppData(prev => ({
      ...prev,
      savingsGoals: prev.savingsGoals.filter(item => item.id !== goal.id),
      transactions: prev.transactions.map(txn => (
        txn.linkedSavingsGoalId === goal.id ? { ...txn, linkedSavingsGoalId: null, updatedAt: new Date().toISOString() } : txn
      ))
    }), { reason: "Archived savings goal permanently deleted" });
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
          <h3>No active savings goals</h3>
          <p className="muted">Add a goal for something like a holiday, car fund, emergency fund, or house deposit.</p>
          <button type="button" className="secondary-button" onClick={openAddGoalModal}>Add first goal</button>
        </section>
      ) : (
        <div className="budget-grid">
          {goals.map(goal => (
            <SavingsGoalCard
              key={goal.id}
              appData={appData}
              goal={goal}
              onEditGoal={openEditGoalModal}
              onArchiveGoal={archiveGoal}
            />
          ))}
        </div>
      )}

      <section className="card archived-card">
        <div className="section-header compact-header">
          <div>
            <h3>Archived savings goals</h3>
          </div>
        </div>

        {archivedGoals.length === 0 ? (
          <p className="muted">No archived savings goals yet.</p>
        ) : (
          <div className="archive-list">
            {archivedGoals.map(goal => (
              <div key={goal.id} className="archive-row">
                <div>
                  <strong>{goal.name}</strong>
                  <small>{formatMoney(goal.currentManualAmount || 0)} saved manually · target {formatMoney(goal.targetAmount || 0)}{goal.archivedAt ? ` · archived ${formatDisplayDate(goal.archivedAt)}` : ""}</small>
                </div>
                <div className="row-actions archive-row-actions">
                  <button type="button" className="secondary-button" onClick={() => restoreGoal(goal)}>Restore</button>
                  <button type="button" className="danger-button" onClick={() => permanentlyDeleteGoal(goal)}>Delete permanently</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showGoalModal && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submitGoal} noValidate>
            <div className="section-header">
              <h2>{editingGoalId ? "Edit savings goal" : "Add savings goal"}</h2>
              <button type="button" className="icon-button" onClick={closeGoalModal} aria-label="Close"><X size={18} aria-hidden="true" /></button>
            </div>

            <ErrorSummary errors={errors} getFieldId={getFieldId} />

            <div className="form-grid">
              <label>
                <span>Goal name<RequiredMark /></span>
                <input
                  {...fieldProps("name")}
                  aria-required="true"
                  placeholder="Holiday"
                  value={goalForm.name}
                  onChange={event => updateGoalForm("name", event.target.value)}
                />
                <FieldError fieldId={getFieldId("name")} message={errors.name} />
              </label>

              <label>
                <span>Target amount<RequiredMark /></span>
                <input
                  {...fieldProps("targetAmount")}
                  aria-required="true"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="800.00"
                  value={goalForm.targetAmount}
                  onChange={event => updateGoalForm("targetAmount", event.target.value)}
                  onBlur={() => validateFieldOnBlur("targetAmount", goalForm)}
                />
                <FieldError fieldId={getFieldId("targetAmount")} message={errors.targetAmount} />
              </label>

              <label>
                Already saved
                <input
                  {...fieldProps("currentManualAmount")}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={goalForm.currentManualAmount}
                  onChange={event => updateGoalForm("currentManualAmount", event.target.value)}
                  onBlur={() => validateFieldOnBlur("currentManualAmount", goalForm)}
                />
                <FieldError fieldId={getFieldId("currentManualAmount")} message={errors.currentManualAmount} />
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
              <button className="primary-button">{editingGoalId ? "Save goal" : "Add goal"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
