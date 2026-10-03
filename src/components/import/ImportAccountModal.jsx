import { FieldError, RequiredMark } from "../common/FormFeedback.jsx";

// "Add account" pop-up for a statement or transfer whose account doesn't exist yet.
export function ImportAccountModal({ form, validation, updateForm, onSave, onClose }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={onSave} noValidate>
        <div className="section-header">
          <div>
            <h2>Add account</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="form-grid">
          <label>
            <span>Account name<RequiredMark /></span>
            <input
              {...validation.fieldProps("name")}
              aria-required="true"
              placeholder="Chase Savings, Monzo Current, Cash"
              value={form.name}
              onChange={event => updateForm("name", event.target.value)}
            />
            <FieldError fieldId={validation.getFieldId("name")} message={validation.errors.name} />
          </label>

          <label>
            Account type
            <select
              value={form.type}
              onChange={event => updateForm("type", event.target.value)}
            >
              <option value="current">Current account</option>
              <option value="savings">Savings account</option>
              <option value="investment">Investment account</option>
              <option value="cash">Cash</option>
              <option value="other">Other account</option>
            </select>
          </label>

          <label>
            Opening balance
            <input
              {...validation.fieldProps("openingBalance")}
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={form.openingBalance}
              onChange={event => updateForm("openingBalance", event.target.value)}
              onBlur={() => validation.validateFieldOnBlur("openingBalance", form)}
            />
            <FieldError fieldId={validation.getFieldId("openingBalance")} message={validation.errors.openingBalance} />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button">Add account</button>
        </div>
      </form>
    </div>
  );
}
