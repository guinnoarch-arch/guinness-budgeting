import { FieldError } from "../common/FormFeedback.jsx";

// Pop-up for setting or changing one category's budget.
export function BudgetEditorModal({ activeAccounts, archiveBudget, budgetAccountIds, budgetErrors, budgetLimit, closeBudgetEditor, editingBudget, saveBudget, setBudgetLimit, toggleBudgetAccount }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={e => { e.preventDefault(); saveBudget(); }} noValidate>
        <div className="section-header">
          <h2>Edit budget for {editingBudget.category.name}</h2>
          <button type="button" className="icon-button" onClick={closeBudgetEditor} aria-label="Close">×</button>
        </div>

        <div className="form-grid">
          <label>
            Budget limit
            <input
              {...budgetErrors.fieldProps("limit")}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="100.00"
              value={budgetLimit}
              onChange={e => setBudgetLimit(e.target.value)}
              onBlur={() => budgetErrors.validateFieldOnBlur("limit", { limit: budgetLimit })}
            />
            <FieldError fieldId={budgetErrors.getFieldId("limit")} message={budgetErrors.errors.limit} />
            <small>Leave at 0 to track spending in this category without a limit.</small>
          </label>

          <label className="account-multiselect-label">
            Linked account(s)
            <div className="account-multiselect">
              {activeAccounts.map(account => (
                <label key={account.id} className="checkbox-label account-multiselect-option">
                  <input
                    type="checkbox"
                    checked={budgetAccountIds.includes(account.id)}
                    onChange={() => toggleBudgetAccount(account.id)}
                  />
                  <span>{account.name}</span>
                </label>
              ))}
            </div>
            <small>Spending across every selected account counts toward this one budget. This budget appears on each selected account's view, plus the All accounts view.</small>
          </label>
        </div>

        <div className="modal-actions split-modal-actions">
          <div>
            {editingBudget.budget && (
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  if (archiveBudget(editingBudget)) closeBudgetEditor();
                }}
              >
                Archive budget
              </button>
            )}
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={closeBudgetEditor}>Cancel</button>
            <button className="primary-button">Save budget</button>
          </div>
        </div>
      </form>
    </div>
  );
}
