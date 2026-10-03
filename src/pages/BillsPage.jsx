import { useEffect, useState } from "react";
import { addDaysToIsoDate, getMonthKey, isInMonth, todayIsoDate } from "../utils/dates.js";
import { formatMoney } from "../utils/money.js";
import { createId } from "../utils/ids.js";
import { checkMoneyAmount, checkRequiredDate, checkRequiredText, collectErrors } from "../utils/validation.js";
import useFormErrors from "../hooks/useFormErrors.js";
import { DEFAULT_ACCOUNT_ID } from "../data/defaultAccounts.js";
import { BillRow, RecurringPaymentCard } from "../components/bills/BillCards.jsx";
import { RecurringItemModal } from "../components/bills/RecurringItemModal.jsx";

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
  accountId: DEFAULT_ACCOUNT_ID,
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
      accountId: item.accountId || activeAccounts[0]?.id || DEFAULT_ACCOUNT_ID,
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
        <RecurringItemModal
          activeAccounts={activeAccounts}
          archiveRecurring={archiveRecurring}
          closeEditRecurring={closeEditRecurring}
          editingItem={editingItem}
          errors={errors}
          expenseCategories={expenseCategories}
          fieldProps={fieldProps}
          form={form}
          getFieldId={getFieldId}
          isAddingBill={isAddingBill}
          saveRecurring={saveRecurring}
          updateForm={updateForm}
          validateFieldOnBlur={validateFieldOnBlur}
        />
      )}
    </div>
  );
}
