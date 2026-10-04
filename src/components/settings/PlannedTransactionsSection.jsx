import { useState } from "react";
import { createId } from "../../utils/ids.js";
import { checkMoneyAmount, checkRequiredDate, checkRequiredText, collectErrors } from "../../utils/validation.js";
import useFormErrors from "../../hooks/useFormErrors.js";
import { FieldError, RequiredMark } from "../common/FormFeedback.jsx";
import { formatMoney } from "../../utils/money.js";
import { formatDisplayDate } from "../../utils/dates.js";

const EMPTY_PLANNED_DRAFT = { title: "", amount: "", date: "", type: "expense" };

function validatePlannedForm(values) {
  return collectErrors({
    title: checkRequiredText(values.title, "a title, for example Car MOT"),
    amount: checkMoneyAmount(values.amount, { example: "55.00" }),
    date: checkRequiredDate(values.date, "the date you expect it")
  });
}

export default function PlannedTransactionsSection({ appData, actions, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const [plannedDraft, setPlannedDraft] = useState(EMPTY_PLANNED_DRAFT);
  const [editingPlannedId, setEditingPlannedId] = useState(null);
  const plannedValidation = useFormErrors("planned", validatePlannedForm);

  function savePlannedTransaction(event) {
    event.preventDefault();
    if (!plannedValidation.validateAll(plannedDraft)) return;
    const amount = Number(plannedDraft.amount || 0);
    const now = new Date().toISOString();
    const fields = {
      title: plannedDraft.title.trim(),
      expectedAmount: amount,
      amount,
      expectedDate: plannedDraft.date,
      date: plannedDraft.date,
      type: plannedDraft.type,
      updatedAt: now
    };

    if (editingPlannedId) {
      actions.updateAppData({
        ...appData,
        plannedTransactions: (appData.plannedTransactions || []).map(item => (
          item.id === editingPlannedId ? { ...item, ...fields } : item
        ))
      }, { reason: "Planned transaction edited" });
    } else {
      const planned = { id: createId("planned"), ...fields, status: "planned", notes: "", createdAt: now };
      actions.updateAppData({
        ...appData,
        plannedTransactions: [planned, ...(appData.plannedTransactions || [])]
      }, { reason: "Planned transaction added" });
    }
    cancelPlannedEdit();
  }

  function updatePlannedDraft(field, value) {
    const next = { ...plannedDraft, [field]: value };
    setPlannedDraft(next);
    plannedValidation.clearFixedErrors(next);
  }

  function startPlannedEdit(item) {
    plannedValidation.resetErrors();
    setEditingPlannedId(item.id);
    setPlannedDraft({
      title: item.title || "",
      amount: String(item.expectedAmount ?? item.amount ?? ""),
      date: item.expectedDate || item.date || "",
      type: item.type || "expense"
    });
  }

  function cancelPlannedEdit() {
    setEditingPlannedId(null);
    setPlannedDraft(EMPTY_PLANNED_DRAFT);
    plannedValidation.resetErrors();
  }

  function deletePlannedTransaction(item) {
    if (!confirm(`Delete the planned transaction "${item.title}"? This can't be undone.`)) return;
    if (editingPlannedId === item.id) cancelPlannedEdit();
    actions.updateAppData({
      ...appData,
      plannedTransactions: (appData.plannedTransactions || []).filter(existing => existing.id !== item.id)
    }, { reason: "Planned transaction deleted" });
  }

  return (
    <section className={sectionClass("planned", "settings-section-entry-card")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("planned")}>
        <div>
          <h3>Planned transactions</h3>
        </div>
        <SectionChevron sectionId="planned" />
      </div>
      {activeSettingsSection === "planned" && (
        <div className="suggestion-section">
          <form className="suggestion-form planned-form" onSubmit={savePlannedTransaction} noValidate>
            <label>
              <span>Title<RequiredMark /></span>
              <input {...plannedValidation.fieldProps("title")} aria-required="true" value={plannedDraft.title} onChange={event => updatePlannedDraft("title", event.target.value)} placeholder="Car MOT" />
              <FieldError fieldId={plannedValidation.getFieldId("title")} message={plannedValidation.errors.title} />
            </label>
            <label>
              <span>Amount<RequiredMark /></span>
              <input {...plannedValidation.fieldProps("amount")} aria-required="true" type="number" inputMode="decimal" min="0" step="0.01" value={plannedDraft.amount} onChange={event => updatePlannedDraft("amount", event.target.value)} onBlur={() => plannedValidation.validateFieldOnBlur("amount", plannedDraft)} placeholder="55.00" />
              <FieldError fieldId={plannedValidation.getFieldId("amount")} message={plannedValidation.errors.amount} />
            </label>
            <label>
              <span>Expected date<RequiredMark /></span>
              <input {...plannedValidation.fieldProps("date")} aria-required="true" type="date" value={plannedDraft.date} onChange={event => updatePlannedDraft("date", event.target.value)} />
              <FieldError fieldId={plannedValidation.getFieldId("date")} message={plannedValidation.errors.date} />
            </label>
            <label>
              Type
              <select value={plannedDraft.type} onChange={event => updatePlannedDraft("type", event.target.value)}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="transfer">Transfer</option>
              </select>
            </label>
            <button className="primary-button">{editingPlannedId ? "Save changes" : "Add planned"}</button>
            {editingPlannedId && <button type="button" className="secondary-button" onClick={cancelPlannedEdit}>Cancel</button>}
          </form>
          <div className="suggestion-list">
            {(appData.plannedTransactions || []).length === 0 ? <p className="muted-text">No planned transactions yet. Add money you expect to come in or go out, so you can see it coming.</p> : (appData.plannedTransactions || []).slice(0, 20).map(item => (
              <div className={`suggestion-row ${editingPlannedId === item.id ? "is-editing" : ""}`} key={item.id}>
                <div><strong>{item.title}</strong><small>{item.status} - {formatDisplayDate(item.expectedDate)} - {formatMoney(item.expectedAmount)}</small></div>
                <div className="row-actions">
                  <button type="button" className="secondary-button small" onClick={() => startPlannedEdit(item)}>Edit</button>
                  <button type="button" className="danger-button small" onClick={() => deletePlannedTransaction(item)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
