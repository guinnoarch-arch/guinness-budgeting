import { ErrorSummary, FieldError, FormError, RequiredMark } from "../common/FormFeedback.jsx";
import { HOUSE_CONTRIBUTION_TYPES, HOUSE_SOURCE_TYPES } from "../../utils/houseTracking.js";
import { formatMoney } from "../../utils/money.js";

export function HouseContributionModal({ house, appData, contributionForm, updateContributionForm, submitContribution, editingContribution, closeContributionModal, isSaving = false, validation, formError }) {
  const people = (appData.housePeople || []).filter(person => person.houseId === house.id);
  const sourceOptions = house.isSharedHouse
    ? HOUSE_SOURCE_TYPES.filter(([key]) => key !== "linkedTransaction")
    : HOUSE_SOURCE_TYPES;
  const linkedTransactions = (appData.transactions || [])
    .filter(transaction => transaction.type === "expense" && (!transaction.linkedHouseId || transaction.id === contributionForm.linkedTransactionId))
    .slice(0, 80);
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submitContribution} noValidate>
        <div className="section-header">
          <h2>{editingContribution ? "Edit contribution" : "Add contribution"}: {house.name}</h2>
          <button type="button" className="icon-button" onClick={closeContributionModal} aria-label="Close">×</button>
        </div>
        <ErrorSummary errors={validation.errors} getFieldId={validation.getFieldId} />
        <div className="form-grid">
          <label>Person<select value={contributionForm.personId} onChange={event => updateContributionForm("personId", event.target.value)}>
            <option value="">Unassigned / type name below</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select></label>
          <label>Person name<input value={contributionForm.personName} onChange={event => updateContributionForm("personName", event.target.value)} /></label>
          <label>
            <span>Amount<RequiredMark /></span>
            <input
              {...validation.fieldProps("amount")}
              aria-required="true"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={contributionForm.amount}
              onChange={event => updateContributionForm("amount", event.target.value)}
              onBlur={() => validation.validateFieldOnBlur("amount", contributionForm)}
            />
            <FieldError fieldId={validation.getFieldId("amount")} message={validation.errors.amount} />
          </label>
          <label>Date<input type="date" value={contributionForm.date} onChange={event => updateContributionForm("date", event.target.value)} /></label>
          <label>Type<select value={contributionForm.type} onChange={event => updateContributionForm("type", event.target.value)}>
            {HOUSE_CONTRIBUTION_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>Source<select value={contributionForm.sourceType} onChange={event => updateContributionForm("sourceType", event.target.value)}>
            {sourceOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          {contributionForm.sourceType === "linkedTransaction" && (
            <label className="full-width">
              <span>Linked transaction<RequiredMark /></span>
              <select {...validation.fieldProps("linkedTransactionId")} aria-required="true" value={contributionForm.linkedTransactionId} onChange={event => updateContributionForm("linkedTransactionId", event.target.value)}>
                <option value="">Choose transaction</option>
                {linkedTransactions.map(transaction => (
                  <option key={transaction.id} value={transaction.id}>{transaction.date} · {transaction.title} · {formatMoney(transaction.amount, false)}</option>
                ))}
              </select>
              <FieldError fieldId={validation.getFieldId("linkedTransactionId")} message={validation.errors.linkedTransactionId} />
            </label>
          )}
          <label className="full-width">Notes<textarea value={contributionForm.notes} onChange={event => updateContributionForm("notes", event.target.value)} /></label>
        </div>
        {contributionForm.sourceType === "external" && <p className="backup-warning-box">External contributions are recorded for the house only. They do not change tracked account balances.</p>}
        {contributionForm.sourceType === "linkedTransaction" && <p className="backup-warning-box">Linked transactions already affect account balances. This records the house contribution view only.</p>}
        <FormError message={formError} />
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={closeContributionModal}>Cancel</button>
          <button className="primary-button" disabled={isSaving}>{isSaving ? "Saving…" : editingContribution ? "Save contribution" : "Add contribution"}</button>
        </div>
      </form>
    </div>
  );
}
