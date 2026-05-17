import { useState } from "react";
import { formatMoney } from "../utils/money.js";

const emptyRecurringForm = {
  id: null,
  name: "",
  amount: "",
  amountType: "fixed",
  categoryId: "cat_bills",
  accountId: "acc_current",
  frequency: "monthly",
  nextDueDate: "",
  autoAdd: false,
  reminderEnabled: true
};

export default function BillsPage({ appData, actions }) {
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(emptyRecurringForm);

  const activeBills = (appData.recurringItems || []).filter(item => item.isActive !== false && !item.archivedAt);
  const archivedBills = (appData.recurringItems || []).filter(item => item.isActive === false || item.archivedAt);
  const paidThisMonth = appData.transactions.filter(txn => txn.isRecurring);
  const expenseCategories = appData.categories.filter(category => category.type === "expense" && category.isActive);
  const activeAccounts = appData.accounts.filter(account => account.isActive);

  function openEditRecurring(item) {
    setEditingItem(item);
    setForm({
      id: item.id,
      name: item.name || "",
      amount: item.amount?.toString() || "",
      amountType: item.amountType || "fixed",
      categoryId: item.categoryId || expenseCategories[0]?.id || "cat_bills",
      accountId: item.accountId || activeAccounts[0]?.id || "acc_current",
      frequency: item.frequency || "monthly",
      nextDueDate: item.nextDueDate || new Date().toISOString().slice(0, 10),
      autoAdd: Boolean(item.autoAdd),
      reminderEnabled: item.reminderEnabled !== false
    });
  }

  function closeEditRecurring() {
    setEditingItem(null);
    setForm(emptyRecurringForm);
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function saveRecurring(e) {
    e.preventDefault();
    if (!editingItem || !form.name.trim()) return;

    const updatedItem = {
      ...editingItem,
      name: form.name.trim(),
      amount: Number(form.amount || 0),
      amountType: form.amountType,
      categoryId: form.categoryId,
      accountId: form.accountId,
      frequency: form.frequency,
      nextDueDate: form.nextDueDate,
      autoAdd: Boolean(form.autoAdd),
      reminderEnabled: Boolean(form.reminderEnabled),
      updatedAt: new Date().toISOString()
    };

    actions.updateAppData({
      ...appData,
      recurringItems: appData.recurringItems.map(item =>
        item.id === editingItem.id ? updatedItem : item
      )
    });
    closeEditRecurring();
  }

  function archiveRecurring(item) {
    const confirmed = window.confirm(
      `Archive ${item.name}? Previous transactions will stay unchanged, but this recurring payment will stop being used.`
    );
    if (!confirmed) return false;

    actions.updateAppData({
      ...appData,
      recurringItems: appData.recurringItems.map(existing =>
        existing.id === item.id
          ? { ...existing, isActive: false, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : existing
      )
    });
    return true;
  }

  function restoreRecurring(item) {
    actions.updateAppData({
      ...appData,
      recurringItems: appData.recurringItems.map(existing =>
        existing.id === item.id
          ? { ...existing, isActive: true, archivedAt: null, updatedAt: new Date().toISOString() }
          : existing
      )
    });
  }

  return (
    <div className="page-grid">
      <div>
        <p className="eyebrow">Bills</p>
        <h2>Recurring payments and reminders</h2>
      </div>

      <div className="two-column">
        <section className="card">
          <h3>Upcoming this week</h3>
          {activeBills.length === 0 ? (
            <p className="muted">No active recurring payments.</p>
          ) : (
            activeBills.slice(0, 4).map(item => <BillRow key={item.id} item={item} />)
          )}
        </section>

        <section className="card">
          <h3>Upcoming this month</h3>
          {activeBills.length === 0 ? (
            <p className="muted">No active recurring payments.</p>
          ) : (
            activeBills.map(item => <BillRow key={item.id} item={item} />)
          )}
        </section>
      </div>

      <section className="card recurring-payments-card">
        <div className="section-header compact-header">
          <div>
            <h3>Recurring payments</h3>
            <p className="muted-text">Edit a subscription or archive it when it is cancelled. Past transactions are not changed.</p>
          </div>
        </div>

        {activeBills.length === 0 ? (
          <p className="muted">No active recurring payments.</p>
        ) : (
          <div className="recurring-card-grid">
            {activeBills.map(item => (
              <RecurringPaymentCard
                key={item.id}
                item={item}
                onEdit={openEditRecurring}
                onArchive={archiveRecurring}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>Archived recurring payments</h3>
        {archivedBills.length === 0 ? (
          <p className="muted">No archived recurring payments yet.</p>
        ) : (
          <div className="recurring-card-grid">
            {archivedBills.map(item => (
              <RecurringPaymentCard
                key={item.id}
                item={item}
                archived
                onEdit={openEditRecurring}
                onArchive={archiveRecurring}
                onRestore={restoreRecurring}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>Paid this month</h3>
        {paidThisMonth.length === 0 ? <p className="muted">No recurring payments paid yet.</p> : paidThisMonth.map(txn => (
          <div key={txn.id} className="simple-row">
            <span>{txn.title}</span>
            <strong>{formatMoney(txn.amount)}</strong>
          </div>
        ))}
      </section>

      {editingItem && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={saveRecurring}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Recurring payment</p>
                <h2>Edit {editingItem.name}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeEditRecurring}>×</button>
            </div>

            <div className="form-grid">
              <label>
                Name
                <input
                  type="text"
                  value={form.name}
                  onChange={e => updateForm("name", e.target.value)}
                  placeholder="Netflix"
                />
              </label>

              <label>
                Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={e => updateForm("amount", e.target.value)}
                  placeholder="13.00"
                />
              </label>

              <label>
                Amount type
                <select value={form.amountType} onChange={e => updateForm("amountType", e.target.value)}>
                  <option value="fixed">Fixed</option>
                  <option value="variable">Variable</option>
                </select>
              </label>

              <label>
                Frequency
                <select value={form.frequency} onChange={e => updateForm("frequency", e.target.value)}>
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
                  value={form.nextDueDate}
                  onChange={e => updateForm("nextDueDate", e.target.value)}
                />
              </label>

              <label>
                Category
                <select value={form.categoryId} onChange={e => updateForm("categoryId", e.target.value)}>
                  {expenseCategories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Account
                <select value={form.accountId} onChange={e => updateForm("accountId", e.target.value)}>
                  {activeAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>

              <label className="checkbox-label recurring-toggle-label">
                <input
                  type="checkbox"
                  checked={form.autoAdd}
                  onChange={e => updateForm("autoAdd", e.target.checked)}
                />
                Auto-add fixed payment
              </label>

              <label className="checkbox-label recurring-toggle-label">
                <input
                  type="checkbox"
                  checked={form.reminderEnabled}
                  onChange={e => updateForm("reminderEnabled", e.target.checked)}
                />
                Reminder enabled
              </label>
            </div>

            <div className="modal-actions split-actions">
              <button type="button" className="danger-button" onClick={() => {
                if (archiveRecurring(editingItem)) closeEditRecurring();
              }}>
                Archive / cancel
              </button>
              <div className="row-actions">
                <button type="button" className="secondary-button" onClick={closeEditRecurring}>Cancel</button>
                <button className="primary-button">Save changes</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function RecurringPaymentCard({ item, archived = false, onEdit, onArchive, onRestore }) {
  return (
    <div className={`sub-card recurring-payment-card ${archived ? "archived-card" : ""}`}>
      <div className="recurring-card-main">
        <strong>{item.name}</strong>
        <p>{formatMoney(item.amount)} · {item.amountType || "fixed"} · {formatFrequency(item.frequency)}</p>
        <p>Next due: {item.nextDueDate || "Not set"}</p>
        {archived && <p className="muted-text">Archived {item.archivedAt ? item.archivedAt.slice(0, 10) : ""}</p>}
      </div>

      <div className="recurring-card-actions">
        <span className="pill">{item.autoAdd ? "Auto-add" : "Confirm"}</span>
        {archived ? (
          <button className="secondary-button" type="button" onClick={() => onRestore(item)}>Restore</button>
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

function BillRow({ item }) {
  return (
    <div className="simple-row">
      <span>
        <strong>{item.name}</strong>
        <small>{item.nextDueDate}</small>
      </span>
      <strong>{formatMoney(item.amount)}</strong>
    </div>
  );
}

function formatFrequency(frequency) {
  return String(frequency || "monthly").replaceAll("_", " ");
}
