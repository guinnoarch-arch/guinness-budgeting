import { useMemo, useState } from "react";
import { todayIsoDate } from "../../utils/dates.js";
import { upsertTransaction } from "../../services/transactionService.js";

export default function TransactionModal({ appData, actions, editingTransaction }) {
  const isEditing = Boolean(editingTransaction);

  const [form, setForm] = useState(() => ({
    type: editingTransaction?.type || "expense",
    date: editingTransaction?.date || todayIsoDate(),
    amount: editingTransaction?.amount || "",
    title: editingTransaction?.title || "",
    note: editingTransaction?.note || "",
    categoryId: editingTransaction?.categoryId || "",
    accountId: editingTransaction?.accountId || "acc_current",
    fromAccountId: editingTransaction?.fromAccountId || "acc_current",
    toAccountId: editingTransaction?.toAccountId || "acc_savings",
    linkedSavingsGoalId: editingTransaction?.linkedSavingsGoalId || "",
    isRecurring: editingTransaction?.isRecurring || false,
    recurringItemId: editingTransaction?.recurringItemId || null,
    recurringAmountType: editingTransaction?.recurringAmountType || "fixed",
    recurringFrequency: editingTransaction?.recurringFrequency || "monthly",
    recurringNextDueDate: editingTransaction?.recurringNextDueDate || editingTransaction?.date || todayIsoDate(),
    recurringAutoAdd: editingTransaction?.recurringAutoAdd ?? true,
    recurringReminderEnabled: editingTransaction?.recurringReminderEnabled ?? true,
    createdAt: editingTransaction?.createdAt
  }));

  const categories = useMemo(() => (
    appData.categories.filter(category => category.isActive && category.type === form.type)
  ), [appData.categories, form.type]);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return alert("Enter an amount above zero.");

    const nextData = upsertTransaction(appData, form, editingTransaction?.id || null);
    actions.updateAppData(nextData);
    actions.closeTransactionModal();
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submit}>
        <div className="section-header">
          <h2>{isEditing ? "Edit transaction" : "Add transaction"}</h2>
          <button type="button" className="icon-button" onClick={actions.closeTransactionModal}>×</button>
        </div>

        <div className="form-grid">
          <label>
            Type
            <select value={form.type} onChange={e => update("type", e.target.value)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>

          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="400.00"
              value={form.amount}
              onChange={e => update("amount", e.target.value)}
            />
          </label>

          <label>
            Date
            <input type="date" value={form.date} onChange={e => update("date", e.target.value)} />
          </label>

          <label>
            Title
            <input placeholder="Tesco food shop" value={form.title} onChange={e => update("title", e.target.value)} />
          </label>

          {form.type !== "transfer" ? (
            <>
              <label>
                Category
                <select value={form.categoryId} onChange={e => update("categoryId", e.target.value)}>
                  <option value="">Choose category</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Account
                <select value={form.accountId} onChange={e => update("accountId", e.target.value)}>
                  {appData.accounts.filter(acc => acc.isActive).map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                From account
                <select value={form.fromAccountId} onChange={e => update("fromAccountId", e.target.value)}>
                  {appData.accounts.filter(acc => acc.isActive).map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>

              <label>
                To account
                <select value={form.toAccountId} onChange={e => update("toAccountId", e.target.value)}>
                  {appData.accounts.filter(acc => acc.isActive).map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Linked savings goal
                <select value={form.linkedSavingsGoalId} onChange={e => update("linkedSavingsGoalId", e.target.value)}>
                  <option value="">None</option>
                  {appData.savingsGoals.filter(goal => goal.isActive).map(goal => (
                    <option key={goal.id} value={goal.id}>{goal.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="full-width">
            Note
            <textarea placeholder="Optional note" value={form.note} onChange={e => update("note", e.target.value)} />
          </label>

          {form.type !== "transfer" && (
            <label className="checkbox-label full-width">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={e => update("isRecurring", e.target.checked)}
              />
              <span>Make this recurring</span>
            </label>
          )}

          {form.isRecurring && form.type !== "transfer" && (
            <div className="recurring-options full-width">
              <label>
                Amount type
                <select value={form.recurringAmountType} onChange={e => update("recurringAmountType", e.target.value)}>
                  <option value="fixed">Fixed</option>
                  <option value="variable">Variable</option>
                </select>
              </label>

              <label>
                Frequency
                <select value={form.recurringFrequency} onChange={e => update("recurringFrequency", e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="every_4_weeks">Every 4 weeks</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>

              <label>
                Next due date
                <input
                  type="date"
                  value={form.recurringNextDueDate}
                  onChange={e => update("recurringNextDueDate", e.target.value)}
                />
              </label>

              <label>
                Add behaviour
                <select
                  value={form.recurringAutoAdd ? "auto" : "confirm"}
                  onChange={e => update("recurringAutoAdd", e.target.value === "auto")}
                >
                  <option value="auto">Auto-add fixed bills</option>
                  <option value="confirm">Confirm manually</option>
                </select>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.recurringReminderEnabled}
                  onChange={e => update("recurringReminderEnabled", e.target.checked)}
                />
                <span>Reminder enabled</span>
              </label>
            </div>
          )}

          <label className="disabled-field full-width">
            Receipt image
            <input disabled placeholder="Coming soon" />
            <small>Receipt image storage will be added later with stronger browser storage.</small>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={actions.closeTransactionModal}>Cancel</button>
          <button className="primary-button">{isEditing ? "Save changes" : "Add transaction"}</button>
        </div>
      </form>
    </div>
  );
}
