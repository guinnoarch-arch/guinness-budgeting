import { FieldError, RequiredMark } from "../common/FormFeedback.jsx";
import { getBudgetAccountIds } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";
import { X } from "lucide-react";

// Budget manager pop-up: add categories and jump to their budget or category editor.
export function BudgetManagerModal({ actions, activeAccounts, activeManagerCategories, addCategoryFromManager, archiveCategory, getCurrentBudgetForCategory, newCategoryDraft, newCategoryErrors, openBudgetEditorFromManager, openCategoryEditorFromManager, setShowBudgetManager, toggleNewCategoryAccount, updateNewCategoryDraft }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card wide-modal-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Budget manager</p>
            <h2>Categories and budgets</h2>
          </div>
          <button type="button" className="icon-button" onClick={() => setShowBudgetManager(false)} aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>

        <form className="manager-add-form" onSubmit={addCategoryFromManager} noValidate>
          <label>
            <span>New category<RequiredMark /></span>
            <input
              {...newCategoryErrors.fieldProps("name")}
              aria-required="true"
              type="text"
              placeholder="Car insurance"
              value={newCategoryDraft.name}
              onChange={event => updateNewCategoryDraft("name", event.target.value)}
            />
            <FieldError fieldId={newCategoryErrors.getFieldId("name")} message={newCategoryErrors.errors.name} />
          </label>
          <label>
            Type
            <select value={newCategoryDraft.type} onChange={event => updateNewCategoryDraft("type", event.target.value)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Group
            <select value={newCategoryDraft.group} onChange={event => updateNewCategoryDraft("group", event.target.value)}>
              <option value="Essentials">Essentials</option>
              <option value="Lifestyle">Lifestyle</option>
              <option value="Finance">Finance</option>
              <option value="Education">Education</option>
              <option value="Income">Income</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label>
            Budget limit
            <input
              {...newCategoryErrors.fieldProps("limit")}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={newCategoryDraft.limit}
              onChange={event => updateNewCategoryDraft("limit", event.target.value)}
              onBlur={() => newCategoryErrors.validateFieldOnBlur("limit", newCategoryDraft)}
              disabled={newCategoryDraft.type !== "expense"}
            />
            <FieldError fieldId={newCategoryErrors.getFieldId("limit")} message={newCategoryErrors.errors.limit} />
          </label>
          <label className="account-multiselect-label">
            Account(s)
            <div className="account-multiselect">
              {activeAccounts.map(account => (
                <label key={account.id} className="checkbox-label account-multiselect-option">
                  <input
                    type="checkbox"
                    checked={newCategoryDraft.accountIds.includes(account.id)}
                    onChange={() => toggleNewCategoryAccount(account.id)}
                    disabled={newCategoryDraft.type !== "expense"}
                  />
                  <span>{account.name}</span>
                </label>
              ))}
            </div>
            <small>Pick one or more accounts this budget should track spending across.</small>
          </label>
          <button className="primary-button">Add</button>
        </form>

        <div className="budget-manager-list">
          {activeManagerCategories.map(category => {
            const budget = getCurrentBudgetForCategory(category.id);
            const accountNames = budget ? getBudgetAccountIds(budget).map(id => activeAccounts.find(item => item.id === id)?.name).filter(Boolean).join(", ") : "";
            return (
              <div key={category.id} className="budget-manager-row">
                <div>
                  <strong>{category.name}</strong>
                  <small>{category.type} · {category.group || "No group"}</small>
                </div>
                <div>
                  {category.type === "expense" ? (
                    <>
                      <strong>{budget ? formatMoney(budget.limit) : "No budget"}</strong>
                      <small>{budget ? `${actions.selectedMonth} · ${accountNames || "Current Account"}` : "Tracked, but no warning limit"}</small>
                    </>
                  ) : (
                    <>
                      <strong>Income category</strong>
                      <small>No spending budget needed</small>
                    </>
                  )}
                </div>
                <div className="row-actions budget-manager-actions">
                  <button type="button" className="secondary-button small" onClick={() => openCategoryEditorFromManager(category)}>Edit category</button>
                  {category.type === "expense" && <button type="button" className="secondary-button small" onClick={() => openBudgetEditorFromManager(category)}>Edit budget</button>}
                  <button type="button" className="danger-button small" onClick={() => archiveCategory(category)}>Archive</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
