import { useState } from "react";
import { createId } from "../../utils/ids.js";
import { getBudgetAccountIds } from "../../utils/calculations.js";
import { formatMonthLabel } from "../../utils/dates.js";
import { checkRequiredText, collectErrors } from "../../utils/validation.js";
import useFormErrors from "../../hooks/useFormErrors.js";
import { FieldError, FormError, RequiredMark } from "../common/FormFeedback.jsx";

function validateTemplateForm(values) {
  return collectErrors({ name: checkRequiredText(values.name, "a name for the template, for example Normal month") });
}

export default function BudgetTemplatesSection({ appData, actions, selectedMonth, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const templateValidation = useFormErrors("template", validateTemplateForm);
  const [templateError, setTemplateError] = useState("");
  const [templateName, setTemplateName] = useState("");

  function saveCurrentBudgetsAsTemplate() {
    setTemplateError("");
    if (!templateValidation.validateAll({ name: templateName })) return;
    const name = templateName.trim();
    const monthBudgets = (appData.budgets || []).filter(item => item.month === selectedMonth && item.isEnabled !== false && !item.isArchived && !item.archivedAt);
    if (monthBudgets.length === 0) {
      return setTemplateError(`${formatMonthLabel(selectedMonth)} has no active budgets to save. Set budgets on the Budgets page first, or switch to a month that has them.`);
    }
    const now = new Date().toISOString();
    const template = {
      id: createId("budget_template"),
      name,
      sourceMonth: selectedMonth,
      items: monthBudgets.map(item => {
        const accountIds = getBudgetAccountIds(item);
        return { categoryId: item.categoryId, accountIds, accountId: accountIds[0], limit: Number(item.limit || 0) };
      }),
      createdAt: now,
      updatedAt: now
    };
    actions.updateAppData({
      ...appData,
      budgetTemplates: [template, ...(appData.budgetTemplates || [])]
    }, { reason: "Budget template created" });
    setTemplateName("");
    actions.notify(`Template "${name}" saved with ${monthBudgets.length} budget${monthBudgets.length === 1 ? "" : "s"}.`);
  }

  function applyBudgetTemplate(template) {
    if (!confirm(`Apply "${template.name}" to ${selectedMonth}? Existing active budgets for the same categories/accounts will be replaced.`)) return;
    // Templates saved before multi-account budgets only stored accountId;
    // getBudgetAccountIds reads either shape.
    const budgetKey = (categoryId, accountIds) => `${categoryId}_${[...accountIds].sort().join("+")}`;
    const keys = new Set((template.items || []).map(item => budgetKey(item.categoryId, getBudgetAccountIds(item))));
    const now = new Date().toISOString();
    const nextBudgets = [
      ...(appData.budgets || []).filter(item => item.month !== selectedMonth || !keys.has(budgetKey(item.categoryId, getBudgetAccountIds(item)))),
      ...(template.items || []).map(item => {
        const accountIds = getBudgetAccountIds(item);
        return {
          id: createId("bud"),
          categoryId: item.categoryId,
          accountIds,
          accountId: accountIds[0],
          month: selectedMonth,
          limit: Number(item.limit || 0),
          isEnabled: true,
          isArchived: false,
          archivedAt: null,
          createdAt: now,
          updatedAt: now
        };
      })
    ];
    actions.updateAppData({ ...appData, budgets: nextBudgets }, { reason: "Budget template applied" });
    actions.notify(`"${template.name}" applied to ${formatMonthLabel(selectedMonth)}.`);
  }

  return (
    <section className={sectionClass("budgetTemplates", "settings-section-entry-card")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("budgetTemplates")}>
        <div>
          <h3>Budget templates</h3>
        </div>
        <SectionChevron sectionId="budgetTemplates" />
      </div>
      {activeSettingsSection === "budgetTemplates" && (
        <div className="suggestion-section">
          <div className="suggestion-form">
            <label>
              <span>Template name<RequiredMark /></span>
              <input
                {...templateValidation.fieldProps("name")}
                aria-required="true"
                value={templateName}
                onChange={event => {
                  setTemplateName(event.target.value);
                  templateValidation.clearFixedErrors({ name: event.target.value });
                }}
                placeholder="Normal month"
              />
              <FieldError fieldId={templateValidation.getFieldId("name")} message={templateValidation.errors.name} />
            </label>
            <button type="button" className="primary-button" onClick={saveCurrentBudgetsAsTemplate}>Save {formatMonthLabel(selectedMonth)}</button>
          </div>
          <FormError message={templateError} />
          <div className="suggestion-list">
            {(appData.budgetTemplates || []).length === 0 ? <p className="muted-text">No budget templates yet.</p> : (appData.budgetTemplates || []).map(template => (
              <div className="suggestion-row" key={template.id}>
                <div><strong>{template.name}</strong><small>{template.items?.length || 0} category budget(s) from {template.sourceMonth}</small></div>
                <button type="button" className="secondary-button small" onClick={() => applyBudgetTemplate(template)}>Apply to {selectedMonth}</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
