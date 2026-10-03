import { ErrorSummary, FieldError, FormError, RequiredMark } from "../common/FormFeedback.jsx";
import { X } from "lucide-react";

// Pop-up for adding or editing an account.
export function AccountFormModal({ accountErrors, accountForm, accountModalError, archiveAccount, closeAccountModal, editingAccount, saveAccount, updateAccountForm }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={saveAccount} noValidate>
        <div className="section-header">
          <h2>{editingAccount ? "Edit account" : "Add account"}</h2>
          <button type="button" className="icon-button" onClick={closeAccountModal} aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>

        <ErrorSummary errors={accountErrors.errors} getFieldId={accountErrors.getFieldId} />

        <div className="form-grid">
          <label>
            <span>Account name<RequiredMark /></span>
            <input
              {...accountErrors.fieldProps("name")}
              aria-required="true"
              placeholder="Monzo, NatWest, Cash, Savings"
              value={accountForm.name}
              onChange={event => updateAccountForm("name", event.target.value)}
            />
            <FieldError fieldId={accountErrors.getFieldId("name")} message={accountErrors.errors.name} />
          </label>

          <label>
            Account type
            <select
              value={accountForm.type}
              onChange={event => updateAccountForm("type", event.target.value)}
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
              {...accountErrors.fieldProps("openingBalance")}
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={accountForm.openingBalance}
              onChange={event => updateAccountForm("openingBalance", event.target.value)}
              onBlur={() => accountErrors.validateFieldOnBlur("openingBalance", accountForm)}
            />
            <FieldError fieldId={accountErrors.getFieldId("openingBalance")} message={accountErrors.errors.openingBalance} />
          </label>
        </div>

        <FormError message={accountModalError} />

        <div className="modal-actions split-modal-actions">
          <div>
            {editingAccount && (
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  if (archiveAccount(editingAccount)) closeAccountModal();
                }}
              >
                Archive account
              </button>
            )}
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={closeAccountModal}>Cancel</button>
            <button className="primary-button">{editingAccount ? "Save account" : "Add account"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
