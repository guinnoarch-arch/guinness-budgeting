import { useState } from "react";
import { createId } from "../../utils/ids.js";
import { applyExclusionRules, getMatchingExclusionRules, undoExclusionRuleChanges } from "../../services/transactionService.js";

export default function PaymentRulesSection({ appData, actions, removeArrayItem, ruleStatus, setRuleStatus, settings, updateArrayItem, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const [newExclusionMatchText, setNewExclusionMatchText] = useState("");
  const [newExclusionExcludeFromTotal, setNewExclusionExcludeFromTotal] = useState(true);
  const [newExclusionExcludeFromBudget, setNewExclusionExcludeFromBudget] = useState(false);
  const [newExclusionExcludeFromChart, setNewExclusionExcludeFromChart] = useState(true);
  const [exclusionApplyStatus, setExclusionApplyStatus] = useState("");
  const [lastApplyChanges, setLastApplyChanges] = useState(null);

  function countExclusionRuleMatches(matchText) {
    const draftRule = { matchText };
    return appData.transactions.filter(transaction => getMatchingExclusionRules(transaction, [draftRule]).length > 0).length;
  }

  function addExclusionRule() {
    const matchText = newExclusionMatchText.trim();
    if (!matchText) {
      setRuleStatus("Enter the text to match in a transaction's description before adding the rule.");
      return;
    }
    if (!newExclusionExcludeFromTotal && !newExclusionExcludeFromBudget && !newExclusionExcludeFromChart) {
      setRuleStatus("Tick at least one exclusion for this rule.");
      return;
    }

    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      exclusionRules: [
        {
          id: createId("exclusion_rule"),
          matchText,
          excludeFromTotal: newExclusionExcludeFromTotal,
          excludeFromBudget: newExclusionExcludeFromBudget,
          excludeFromChart: newExclusionExcludeFromChart,
          createdAt: now,
          updatedAt: now
        },
        ...(appData.exclusionRules || [])
      ]
    });
    setNewExclusionMatchText("");
    setRuleStatus(`Added exclusion rule for "${matchText}". Use "Apply rules now" to sweep existing transactions.`);
  }

  function runExclusionRules() {
    const rules = appData.exclusionRules || [];
    if (!rules.length) {
      setExclusionApplyStatus("Add a rule first, then apply it.");
      return;
    }
    const { data: nextData, updatedCount, changes } = applyExclusionRules(appData);
    actions.updateAppData(nextData);
    setLastApplyChanges(updatedCount > 0 ? changes : null);
    setExclusionApplyStatus(
      updatedCount > 0
        ? `Applied ${rules.length} rule${rules.length === 1 ? "" : "s"} — updated ${updatedCount} transaction${updatedCount === 1 ? "" : "s"}.`
        : `Applied ${rules.length} rule${rules.length === 1 ? "" : "s"} — every matching transaction was already excluded.`
    );
  }

  function undoLastApply() {
    if (!lastApplyChanges || !lastApplyChanges.length) return;
    const nextData = undoExclusionRuleChanges(appData, lastApplyChanges);
    actions.updateAppData(nextData);
    setExclusionApplyStatus(`Undone — reverted ${lastApplyChanges.length} transaction${lastApplyChanges.length === 1 ? "" : "s"} to how they were before that apply.`);
    setLastApplyChanges(null);
  }

  return (
    <>
      <section className={sectionClass("exclusionRules", "settings-section-entry-card")}>
        <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("exclusionRules")}>
          <div>
            <h3>Payment Rules</h3>
          </div>
          <div className="settings-accordion-heading-side"><span className="pill">{(appData.exclusionRules || []).length} rules</span><SectionChevron sectionId="exclusionRules" /></div>
        </div>
      </section>

      {activeSettingsSection === "exclusionRules" && (
        <section className="card import-rules-settings-card" id="exclusion-rules-manager">
          <div className="section-header compact-header">
            <div>
              <h3>Payment Rules Manager</h3>
            </div>
          </div>

          {ruleStatus && <div className="import-status-box">{ruleStatus}</div>}

          <div className="manual-rule-add-box">
            <h5>Add payment rule</h5>
            <div className="manual-rule-add-grid">
              <label>
                Description contains
                <input
                  value={newExclusionMatchText}
                  onChange={event => setNewExclusionMatchText(event.target.value)}
                  placeholder="e.g. R GUINNESS"
                />
              </label>
            </div>
            {newExclusionMatchText.trim() && (
              <p className="muted-text rule-live-preview">
                Would currently match <strong>{countExclusionRuleMatches(newExclusionMatchText)}</strong> transaction{countExclusionRuleMatches(newExclusionMatchText) === 1 ? "" : "s"} — check the wording before adding, especially for a common word.
              </p>
            )}
            <div className="exclude-toggle-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newExclusionExcludeFromTotal}
                  onChange={event => setNewExclusionExcludeFromTotal(event.target.checked)}
                />
                Exclude from spending &amp; income totals
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newExclusionExcludeFromChart}
                  onChange={event => setNewExclusionExcludeFromChart(event.target.checked)}
                />
                Exclude from charts
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newExclusionExcludeFromBudget}
                  onChange={event => setNewExclusionExcludeFromBudget(event.target.checked)}
                />
                Exclude from budgets
              </label>
            </div>
            <button className="primary-button" onClick={addExclusionRule}>Add rule</button>
          </div>

          {(appData.exclusionRules || []).length === 0 ? (
            <p className="muted">No payment rules saved yet.</p>
          ) : (
            <>
              <div className="rule-list-stack">
                {(appData.exclusionRules || []).map(rule => {
                  const matchCount = appData.transactions.filter(transaction => (
                    getMatchingExclusionRules(transaction, [rule]).length > 0
                  )).length;
                  return (
                    <div key={rule.id} className="rule-edit-row">
                      <label>
                        Description contains
                        <input
                          value={rule.matchText || ""}
                          onChange={event => updateArrayItem("exclusionRules", rule.id, { matchText: event.target.value })}
                          placeholder="e.g. R GUINNESS"
                        />
                      </label>
                      <div className="exclude-toggle-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={Boolean(rule.excludeFromTotal)}
                            onChange={event => updateArrayItem("exclusionRules", rule.id, { excludeFromTotal: event.target.checked })}
                          />
                          Totals
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={Boolean(rule.excludeFromChart)}
                            onChange={event => updateArrayItem("exclusionRules", rule.id, { excludeFromChart: event.target.checked })}
                          />
                          Charts
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={Boolean(rule.excludeFromBudget)}
                            onChange={event => updateArrayItem("exclusionRules", rule.id, { excludeFromBudget: event.target.checked })}
                          />
                          Budgets
                        </label>
                      </div>
                      <div className="rule-readable-summary">
                        <span className="pill">{matchCount} matching transaction{matchCount === 1 ? "" : "s"}</span>
                      </div>
                      <button className="secondary-button small" onClick={() => removeArrayItem("exclusionRules", rule.id, "payment rule")}>Delete</button>
                    </div>
                  );
                })}
              </div>

              <div className="section-header compact-header">
                <div>
                </div>
                <button className="primary-button" onClick={runExclusionRules}>Apply rules now</button>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(settings.autoRefreshPaymentRules)}
                  onChange={event => actions.updateAppData({
                    ...appData,
                    settings: { ...settings, autoRefreshPaymentRules: event.target.checked }
                  }, { reason: event.target.checked ? "Payment rules set to refresh automatically" : "Payment rules set to ask before refreshing" })}
                />
                Refresh these rules automatically after every CSV import or new transfer (instead of asking in a banner)
              </label>
              {exclusionApplyStatus && (
                <div className="import-status-box">
                  {exclusionApplyStatus}
                  {lastApplyChanges && lastApplyChanges.length > 0 && (
                    <button type="button" className="secondary-button small" onClick={undoLastApply}>
                      Undo last apply ({lastApplyChanges.length})
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
