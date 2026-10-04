import { DEFAULT_BUDGET_AFFORDABILITY_THRESHOLD, DEFAULT_LARGE_EXPENSE_THRESHOLD, DEFAULT_LARGE_INCOME_THRESHOLD } from "../../config/appDefaults.js";

export default function BudgetBehaviourSection({ appData, actions, settings, accordion }) {
  const { sectionClass, sectionHeaderProps, SectionChevron } = accordion;

  function updateBudgetBehaviourSetting(field, value) {
    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        [field]: value
      }
    }, { reason: "Budget behaviour setting changed" });
  }

  return (
    <section className={sectionClass("budgetBehaviour", "budget-behaviour-settings-card")}>
      <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("budgetBehaviour")}>
        <div>
          <p className="eyebrow">Budget logic</p>
          <h3>Budget behaviour</h3>
        </div>
        <div className="settings-accordion-heading-side"><SectionChevron sectionId="budgetBehaviour" /></div>
      </div>

      <div className="form-grid appearance-form-grid">
        <label>
          Large expense threshold
          <input
            type="number"
            min="0"
            step="1"
            value={settings.largeExpenseThreshold || DEFAULT_LARGE_EXPENSE_THRESHOLD}
            onChange={event => updateBudgetBehaviourSetting("largeExpenseThreshold", Number(event.target.value || 0))}
          />
          <small>CSV import and Add Transaction highlight the exclude-from-budget option above this amount, and it sets the minimum for the dashboard's major spends list.</small>
        </label>

        <label>
          Large income threshold
          <input
            type="number"
            min="0"
            step="1"
            value={settings.largeIncomeThreshold || DEFAULT_LARGE_INCOME_THRESHOLD}
            onChange={event => updateBudgetBehaviourSetting("largeIncomeThreshold", Number(event.target.value || 0))}
          />
          <small>The minimum for the dashboard's big incomes list (click the Income card). Transfers between your own accounts aren't counted as income.</small>
        </label>

        <label>
          Budget affordability warning threshold
          <input
            type="number"
            min="0"
            step="1"
            value={settings.budgetAffordabilityThreshold || DEFAULT_BUDGET_AFFORDABILITY_THRESHOLD}
            onChange={event => updateBudgetBehaviourSetting("budgetAffordabilityThreshold", Number(event.target.value || 0))}
          />
          <small>Warn when remaining budgets are within this amount of available account money.</small>
        </label>

        <label className="checkbox-label appearance-checkbox-label">
          <input
            type="checkbox"
            checked={settings.budgetAffordabilityWarningsEnabled !== false}
            onChange={event => updateBudgetBehaviourSetting("budgetAffordabilityWarningsEnabled", event.target.checked)}
          />
          Show reminders when budgets are close to not being affordable from linked account balances
        </label>
      </div>
    </section>
  );
}
