import { useEffect, useState } from "react";
import { addDaysToIsoDate, getMonthKey, isInMonth, todayIsoDate } from "../utils/dates.js";
import { formatMoney } from "../utils/money.js";
import { createId } from "../utils/ids.js";
import { checkMoneyAmount, checkRequiredDate, checkRequiredText, collectErrors } from "../utils/validation.js";
import useFormErrors from "../hooks/useFormErrors.js";
import { ErrorSummary, FieldError, RequiredMark } from "../components/common/FormFeedback.jsx";

function validateBillForm(values) {
  return collectErrors({
    name: checkRequiredText(values.name, "a name for this bill, for example Netflix or Council tax"),
    amount: checkMoneyAmount(values.amount, { example: "13.99" }),
    nextDueDate: checkRequiredDate(values.nextDueDate, "when the next payment is due"),
    accountId: values.accountId ? "" : "Choose the account this bill is paid from."
  });
}

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
  // null = closed, "new" = adding a bill, otherwise the bill being edited.
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(emptyRecurringForm);
  const { errors, getFieldId, validateAll, validateFieldOnBlur, clearFixedErrors, resetErrors, fieldProps } = useFormErrors("bill", validateBillForm);
  const isAddingBill = editingItem === "new";

  useEffect(() => {
    clearFixedErrors(form);
    // Only re-check when the form values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const today = todayIsoDate();
  const weekEnd = addDaysToIsoDate(today, 7);
  const currentMonth = getMonthKey(new Date());
  const activeBills = (appData.recurringItems || [])
    .filter(item => item.isActive !== false && !item.archivedAt)
    .sort((a, b) => String(a.nextDueDate || "9999-99-99").localeCompare(String(b.nextDueDate || "9999-99-99")));
  const upcomingThisWeek = activeBills.filter(item => item.nextDueDate && item.nextDueDate >= today && item.nextDueDate <= weekEnd);
  const upcomingThisMonth = activeBills.filter(item => item.nextDueDate && isInMonth(item.nextDueDate, currentMonth));
  const archivedBills = (appData.recurringItems || []).filter(item => item.isActive === false || item.archivedAt);
  const paidThisMonth = (appData.transactions || []).filter(txn => txn.isRecurring && isInMonth(txn.date, currentMonth));
  const expenseCategories = (appData.categories || []).filter(category => category.type === "expense" && category.isActive !== false);
  const activeAccounts = (appData.accounts || []).filter(account => account.isActive !== false);

  useEffect(() => {
    if (actions.pageIntent?.page !== "bills" || actions.pageIntent.intent !== "add-bill") return;
    openAddRecurring();
    actions.clearPageIntent();
    // Only react to a new intent, not to every data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions.pageIntent]);

  function openAddRecurring() {
    setEditingItem("new");
    resetErrors();
    setForm({
      ...emptyRecurringForm,
      categoryId: expenseCategories.find(category => category.id === emptyRecurringForm.categoryId)?.id || expenseCategories[0]?.id || "",
      accountId: activeAccounts[0]?.id || "",
      nextDueDate: todayIsoDate()
    });
  }

  function openEditRecurring(item) {
    setEditingItem(item);
    resetErrors();
    setForm({
      id: item.id,
      name: item.name || "",
      amount: item.amount?.toString() || "",
      amountType: item.amountType || "fixed",
      categoryId: item.categoryId || expenseCategories[0]?.id || "cat_bills",
      accountId: item.accountId || activeAccounts[0]?.id || "acc_current",
      frequency: item.frequency || "monthly",
      nextDueDate: item.nextDueDate || todayIsoDate(),
      autoAdd: Boolean(item.autoAdd),
      reminderEnabled: item.reminderEnabled !== false
    });
  }

  function closeEditRecurring() {
    setEditingItem(null);
    setForm(emptyRecurringForm);
    resetErrors();
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function saveRecurring(e) {
    e.preventDefault();
    if (!editingItem) return;
    if (!validateAll(form)) return;

    if (isAddingBill) {
      const now = new Date().toISOString();
      const newItem = {
        id: createId("rec"),
        name: form.name.trim(),
        type: "expense",
        amount: Number(form.amount),
        amountType: form.amountType,
        categoryId: form.categoryId,
        accountId: form.accountId,
        frequency: form.frequency,
        nextDueDate: form.nextDueDate,
        autoAdd: Boolean(form.autoAdd),
        reminderEnabled: Boolean(form.reminderEnabled),
        isActive: true,
        isExample: false,
        createdAt: now,
        updatedAt: now
      };
      actions.updateAppData({
        ...appData,
        recurringItems: [newItem, ...(appData.recurringItems || [])]
      }, { reason: "Bill added" });
      closeEditRecurring();
      return;
    }

    const previousAmount = Number(editingItem.amount || 0);
    const nextAmount = Number(form.amount || 0);
    const amountIncreased = nextAmount > previousAmount;
    const now = new Date().toISOString();

    const updatedItem = {
      ...editingItem,
      name: form.name.trim(),
      amount: nextAmount,
      ...(amountIncreased ? {
        previousAmount,
        amountChangedAt: now,
        amountChangeType: "increase"
      } : {}),
      amountType: form.amountType,
      categoryId: form.categoryId,
      accountId: form.accountId,
      frequency: form.frequency,
      nextDueDate: form.nextDueDate,
      autoAdd: Boolean(form.autoAdd),
      reminderEnabled: Boolean(form.reminderEnabled),
      updatedAt: now
    };

    actions.updateAppData({
      ...appData,
      recurringItems: appData.recurringItems.map(item =>
        item.id === editingItem.id ? updatedItem : item
      )
    }, { reason: "Bill edited" });
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
    }, { reason: "Bill archived" });
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
    }, { reason: "Bill restored" });
  }

  function deleteRecurringPermanently(item) {
    const paidCount = (appData.transactions || []).filter(txn => txn.recurringItemId === item.id).length;
    const historyNote = paidCount > 0
      ? ` The ${paidCount} payment${paidCount === 1 ? "" : "s"} already recorded will stay in Transactions.`
      : "";
    if (!window.confirm(`Permanently delete ${item.name}? This can't be undone.${historyNote}`)) return;
    actions.updateAppData({
      ...appData,
      recurringItems: appData.recurringItems.filter(existing => existing.id !== item.id)
    }, { reason: "Archived bill permanently deleted" });
  }

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Bills</p>
          <h2>Recurring payments and reminders</h2>
        </div>
        <button type="button" className="primary-button" onClick={openAddRecurring}>+ Add bill</button>
      </div>

      <div className="two-column">
        <section className="card">
          <h3>Upcoming this week</h3>
          {upcomingThisWeek.length === 0 ? (
            <p className="muted">No bills due in the next 7 days.</p>
          ) : (
            upcomingThisWeek.map(item => <BillRow key={item.id} item={item} />)
          )}
        </section>

        <section className="card">
          <h3>Upcoming this month</h3>
          {upcomingThisMonth.length === 0 ? (
            <p className="muted">No active recurring payments due this month.</p>
          ) : (
            upcomingThisMonth.map(item => <BillRow key={item.id} item={item} />)
          )}
        </section>
      </div>

      <section className="card recurring-payments-card">
        <div className="section-header compact-header">
          <div>
            <h3>Recurring payments</h3>
          </div>
        </div>

        {activeBills.length === 0 ? (
          <div className="empty-state-card">
            <p className="muted">No bills yet. Add rent, subscriptions or anything else you pay regularly, and they'll show here with reminders before they're due.</p>
            <button type="button" className="secondary-button" onClick={openAddRecurring}>Add your first bill</button>
          </div>
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
                onDelete={deleteRecurringPermanently}
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
          <form className="modal-card" onSubmit={saveRecurring} noValidate>
            <div className="section-header">
              <div>
                <p className="eyebrow">Recurring payment</p>
                <h2>{isAddingBill ? "Add bill" : `Edit ${editingItem.name}`}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeEditRecurring} aria-label="Close">×</button>
            </div>

            <ErrorSummary errors={errors} getFieldId={getFieldId} />

            <div className="form-grid">
              <label>
                <span>Name<RequiredMark /></span>
                <input
                  {...fieldProps("name")}
                  aria-required="true"
                  type="text"
                  value={form.name}
                  onChange={e => updateForm("name", e.target.value)}
                  placeholder="Netflix"
                />
                <FieldError fieldId={getFieldId("name")} message={errors.name} />
              </label>

              <label>
                <span>Amount<RequiredMark /></span>
                <input
                  {...fieldProps("amount")}
                  aria-required="true"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={e => updateForm("amount", e.target.value)}
                  onBlur={() => validateFieldOnBlur("amount", form)}
                  placeholder="13.00"
                />
                <FieldError fieldId={getFieldId("amount")} message={errors.amount} />
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
                <span>Next due date<RequiredMark /></span>
                <input
                  {...fieldProps("nextDueDate")}
                  aria-required="true"
                  type="date"
                  value={form.nextDueDate}
                  onChange={e => updateForm("nextDueDate", e.target.value)}
                />
                <FieldError fieldId={getFieldId("nextDueDate")} message={errors.nextDueDate} />
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
                <span>Account<RequiredMark /></span>
                <select {...fieldProps("accountId")} aria-required="true" value={form.accountId} onChange={e => updateForm("accountId", e.target.value)}>
                  {activeAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                <FieldError fieldId={getFieldId("accountId")} message={errors.accountId} />
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
              <div>
                {!isAddingBill && (
                  <button type="button" className="danger-button" onClick={() => {
                    if (archiveRecurring(editingItem)) closeEditRecurring();
                  }}>
                    Archive bill
                  </button>
                )}
              </div>
              <div className="row-actions">
                <button type="button" className="secondary-button" onClick={closeEditRecurring}>Cancel</button>
                <button className="primary-button">{isAddingBill ? "Add bill" : "Save changes"}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function RecurringPaymentCard({ item, archived = false, onEdit, onArchive, onRestore, onDelete }) {
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
