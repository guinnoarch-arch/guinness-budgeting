import { ErrorSummary, FieldError, RequiredMark } from "../common/FormFeedback.jsx";
import { X } from "lucide-react";

// Pop-up for adding or editing a recurring payment.
export function RecurringItemModal({ activeAccounts, archiveRecurring, closeEditRecurring, editingItem, errors, expenseCategories, fieldProps, form, getFieldId, isAddingBill, saveRecurring, updateForm, validateFieldOnBlur }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={saveRecurring} noValidate>
        <div className="section-header">
          <div>
            <p className="eyebrow">Recurring payment</p>
            <h2>{isAddingBill ? "Add bill" : `Edit ${editingItem.name}`}</h2>
          </div>
          <button type="button" className="icon-button" onClick={closeEditRecurring} aria-label="Close"><X size={18} aria-hidden="true" /></button>
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
  );
}
