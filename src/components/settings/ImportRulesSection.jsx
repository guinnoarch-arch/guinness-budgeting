import { useState } from "react";
import { createId } from "../../utils/ids.js";

function normaliseRuleText(value) {
  return String(value || "").trim().toLowerCase();
}

export default function ImportRulesSection({ appData, actions, removeArrayItem, ruleStatus, setRuleStatus, updateArrayItem, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const [activeImportRulesPanel, setActiveImportRulesPanel] = useState("external");
  const [selectedRuleCategoryId, setSelectedRuleCategoryId] = useState("");
  const [newExternalName, setNewExternalName] = useState("");
  const [newExternalAccountId, setNewExternalAccountId] = useState("");
  const [newCategoryMatchText, setNewCategoryMatchText] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");

  function addExternalAccountMapping() {
    const externalName = newExternalName.trim();
    const gbAccountId = newExternalAccountId;

    if (!externalName || !gbAccountId) {
      setRuleStatus("Enter the name your bank uses and choose which of your accounts it means, then add the mapping.");
      return;
    }

    const alreadyExists = (appData.externalAccountMappings || []).some(mapping => (
      normaliseRuleText(mapping.externalName) === normaliseRuleText(externalName)
    ));

    if (alreadyExists && !confirm("A mapping with this external name already exists. Add another one anyway?")) {
      return;
    }

    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      externalAccountMappings: [
        {
          id: createId("external_map"),
          externalName,
          gbAccountId,
          matchType: "contains",
          source: "settings_manual",
          createdAt: now,
          updatedAt: now,
          lastUsedAt: null
        },
        ...(appData.externalAccountMappings || [])
      ]
    });

    setNewExternalName("");
    setNewExternalAccountId("");
    setRuleStatus("Added external account mapping.");
  }

  function addCategoryMatchRule() {
    const matchText = newCategoryMatchText.trim();
    const categoryId = newCategoryId || selectedRuleCategoryId || appData.categories.find(category => category.isActive !== false)?.id || "";
    const category = appData.categories.find(item => item.id === categoryId);

    if (!matchText || !category) {
      setRuleStatus("Enter a match text and choose a category before adding the rule.");
      return;
    }

    const alreadyExists = (appData.importRules || []).some(rule => (
      normaliseRuleText(rule.matchText) === normaliseRuleText(matchText)
      && rule.categoryId === categoryId
    ));

    if (alreadyExists && !confirm("This category already has that match text. Add another one anyway?")) {
      return;
    }

    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      importRules: [
        {
          id: createId("import_rule"),
          matchText,
          categoryId,
          transactionType: category.type || "expense",
          source: "settings_manual",
          createdAt: now,
          updatedAt: now,
          lastUsedAt: null
        },
        ...(appData.importRules || [])
      ]
    });

    setNewCategoryMatchText("");
    setNewCategoryId(categoryId);
    setSelectedRuleCategoryId(categoryId);
    setRuleStatus("Added category match text.");
  }

  function getAccountName(accountId) {
    return appData.accounts.find(account => account.id === accountId)?.name || "Unknown account";
  }

  function getCategoryType(categoryId) {
    return appData.categories.find(category => category.id === categoryId)?.type || "expense";
  }

  function getCategoryOptions(type) {
    return (appData.categories || []).filter(category => category.type === type && category.isActive !== false);
  }

  const savedCategoryRules = appData.importRules || [];
  const ruleCategories = appData.categories.filter(category => category.isActive !== false);
  const selectedCategoryIdForView = selectedRuleCategoryId || newCategoryId || ruleCategories[0]?.id || "";
  const selectedRuleCategory = appData.categories.find(category => category.id === selectedCategoryIdForView);
  const selectedCategoryRules = savedCategoryRules.filter(rule => rule.categoryId === selectedCategoryIdForView);
  const unassignedCategoryRules = savedCategoryRules.filter(rule => !rule.categoryId || !appData.categories.some(category => category.id === rule.categoryId));

  return (
    <>
      <section className={sectionClass("importRules", "settings-section-entry-card")}>
        <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("importRules")}>
          <div>
            <h3>Import Rules</h3>
          </div>
          <div className="settings-accordion-heading-side"><span className="pill">{(appData.importRules || []).length} rules</span><SectionChevron sectionId="importRules" /></div>
        </div>
        <div className="settings-section-summary-grid">
          <div>
            <strong>{(appData.externalAccountMappings || []).length}</strong>
            <span>External account mappings</span>
          </div>
          <div>
            <strong>{(appData.importRules || []).length}</strong>
            <span>Category match texts</span>
          </div>
          <div>
            <strong>{(appData.csvColumnMappings || []).length}</strong>
            <span>Saved CSV formats</span>
          </div>
        </div>
      </section>

      {activeSettingsSection === "importRules" && (
        <section className="card import-rules-settings-card" id="import-rules-manager">
          <div className="section-header compact-header">
            <div>
              <h3>Import Rules Manager</h3>
            </div>
          </div>

          {ruleStatus && <div className="import-status-box">{ruleStatus}</div>}

          <div className="import-rules-panel-tabs">
            <button
              className={activeImportRulesPanel === "external" ? "secondary-button active" : "secondary-button"}
              onClick={() => setActiveImportRulesPanel("external")}
            >
              External accounts
            </button>
            <button
              className={activeImportRulesPanel === "categories" ? "secondary-button active" : "secondary-button"}
              onClick={() => setActiveImportRulesPanel("categories")}
            >
              Category match texts
            </button>
            <button
              className={activeImportRulesPanel === "csv" ? "secondary-button active" : "secondary-button"}
              onClick={() => setActiveImportRulesPanel("csv")}
            >
              Saved CSV formats
            </button>
          </div>

          {activeImportRulesPanel === "external" && (
            <div className="rules-manager-panel">
              <div className="section-header compact-header">
                <div>
                  <h4>External account mappings</h4>
                </div>
                <span className="pill">{(appData.externalAccountMappings || []).length} saved</span>
              </div>

              <div className="manual-rule-add-box">
                <h5>Add external account mapping</h5>
                <div className="manual-rule-add-grid external-add-grid">
                  <label>
                    External name from CSV/bank
                    <input
                      value={newExternalName}
                      onChange={event => setNewExternalName(event.target.value)}
                      placeholder="e.g. Uni, Chase Saver, Monzo Pot"
                    />
                  </label>
                  <label>
                    GH account
                    <select
                      value={newExternalAccountId}
                      onChange={event => setNewExternalAccountId(event.target.value)}
                    >
                      <option value="">Choose account</option>
                      {appData.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </label>
                  <button className="primary-button" onClick={addExternalAccountMapping}>Add mapping</button>
                </div>
              </div>

              {(appData.externalAccountMappings || []).length === 0 ? (
                <p className="muted">No external account mappings saved yet.</p>
              ) : (
                <div className="rule-list-stack">
                  {(appData.externalAccountMappings || []).map(mapping => (
                    <div key={mapping.id} className="rule-edit-row external-account-rule-row">
                      <label>
                        External name from CSV/bank
                        <input
                          value={mapping.externalName || ""}
                          onChange={event => updateArrayItem("externalAccountMappings", mapping.id, { externalName: event.target.value })}
                          placeholder="e.g. Uni, Chase Saver"
                        />
                      </label>
                      <label>
                        GH account
                        <select
                          value={mapping.gbAccountId || ""}
                          onChange={event => updateArrayItem("externalAccountMappings", mapping.id, { gbAccountId: event.target.value })}
                        >
                          <option value="">Choose account</option>
                          {appData.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                      </label>
                      <div className="rule-readable-summary">
                        <strong>{mapping.externalName || "External name"}</strong>
                        <span>maps to</span>
                        <strong>{mapping.gbAccountId ? getAccountName(mapping.gbAccountId) : "No GH account selected"}</strong>
                      </div>
                      <button className="secondary-button small" onClick={() => removeArrayItem("externalAccountMappings", mapping.id, "external account mapping")}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeImportRulesPanel === "categories" && (
            <div className="rules-manager-panel">
              <div className="section-header compact-header">
                <div>
                  <h4>Category match texts</h4>
                </div>
                <span className="pill">{savedCategoryRules.length} saved</span>
              </div>

              <div className="manual-rule-add-box">
                <h5>Add category match text</h5>
                <div className="manual-rule-add-grid category-add-grid">
                  <label>
                    Category
                    <select
                      value={newCategoryId || selectedCategoryIdForView}
                      onChange={event => {
                        setNewCategoryId(event.target.value);
                        setSelectedRuleCategoryId(event.target.value);
                      }}
                    >
                      {ruleCategories.map(category => (
                        <option key={category.id} value={category.id}>{category.name} ({category.type})</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Match text
                    <input
                      value={newCategoryMatchText}
                      onChange={event => setNewCategoryMatchText(event.target.value)}
                      placeholder="e.g. OPENAI, TESCO, NETFLIX"
                    />
                  </label>
                  <button className="primary-button" onClick={addCategoryMatchRule}>Add match text</button>
                </div>
              </div>

              <div className="category-rule-browser">
                <label>
                  View category
                  <select
                    value={selectedCategoryIdForView}
                    onChange={event => setSelectedRuleCategoryId(event.target.value)}
                  >
                    {ruleCategories.map(category => {
                      const count = savedCategoryRules.filter(rule => rule.categoryId === category.id).length;
                      return (
                        <option key={category.id} value={category.id}>{category.name} ({count})</option>
                      );
                    })}
                  </select>
                </label>
              </div>

              {!selectedRuleCategory ? (
                <p className="muted">No categories are available yet.</p>
              ) : (
                <div className="category-rule-group single-category-rule-group">
                  <div className="category-rule-group-header">
                    <div>
                      <h5>{selectedRuleCategory.name}</h5>
                      <p className="muted-text">{selectedRuleCategory.type === "income" ? "Income" : "Expense"} category</p>
                    </div>
                    <span className="pill">{selectedCategoryRules.length} match{selectedCategoryRules.length === 1 ? "" : "es"}</span>
                  </div>

                  {selectedCategoryRules.length === 0 ? (
                    <p className="muted">No match text saved for this category yet.</p>
                  ) : (
                    <div className="category-match-list">
                      {selectedCategoryRules.map(rule => (
                        <div key={rule.id} className="category-match-row">
                          <input
                            value={rule.matchText || ""}
                            onChange={event => updateArrayItem("importRules", rule.id, { matchText: event.target.value })}
                            aria-label={`Match text for ${selectedRuleCategory.name}`}
                            placeholder="e.g. OPENAI"
                          />
                          <button className="secondary-button small" onClick={() => removeArrayItem("importRules", rule.id, "category match text")}>Delete</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {unassignedCategoryRules.length > 0 && (
                <div className="category-rule-group warning-group">
                  <div className="category-rule-group-header">
                    <div>
                      <h5>Unassigned / missing category</h5>
                      <p className="muted-text">These rules point to a category that no longer exists or has not been selected.</p>
                    </div>
                    <span className="pill">{unassignedCategoryRules.length}</span>
                  </div>
                  <div className="category-match-list">
                    {unassignedCategoryRules.map(rule => {
                      const type = rule.transactionType || getCategoryType(rule.categoryId);
                      return (
                        <div key={rule.id} className="category-match-row unassigned-match-row">
                          <input
                            value={rule.matchText || ""}
                            onChange={event => updateArrayItem("importRules", rule.id, { matchText: event.target.value })}
                            placeholder="Match text"
                          />
                          <select
                            value={rule.categoryId || ""}
                            onChange={event => updateArrayItem("importRules", rule.id, { categoryId: event.target.value })}
                          >
                            <option value="">Choose category</option>
                            {getCategoryOptions(type).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                          </select>
                          <button className="secondary-button small" onClick={() => removeArrayItem("importRules", rule.id, "category match text")}>Delete</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeImportRulesPanel === "csv" && (
            <div className="rules-manager-panel">
              <div className="section-header compact-header">
                <div>
                  <h4>Saved CSV column mappings</h4>
                </div>
                <span className="pill">{(appData.csvColumnMappings || []).length} saved</span>
              </div>

              {(appData.csvColumnMappings || []).length === 0 ? (
                <p className="muted">No CSV column mappings saved yet.</p>
              ) : (
                <div className="rule-list-stack">
                  {(appData.csvColumnMappings || []).map(mapping => (
                    <div key={mapping.id} className="rule-edit-row csv-mapping-row">
                      <label>
                        Mapping name
                        <input
                          value={mapping.name || mapping.fileName || "CSV format"}
                          onChange={event => updateArrayItem("csvColumnMappings", mapping.id, { name: event.target.value })}
                        />
                      </label>
                      <label>
                        Default account
                        <select
                          value={mapping.accountId || ""}
                          onChange={event => updateArrayItem("csvColumnMappings", mapping.id, { accountId: event.target.value })}
                        >
                          <option value="">No default</option>
                          {appData.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                      </label>
                      <div className="rule-map-summary">
                        <small>Date: {mapping.columnMap?.date || "—"}</small>
                        <small>Description: {mapping.columnMap?.description || "—"}</small>
                        <small>Amount: {mapping.columnMap?.amount || `${mapping.columnMap?.paidIn || "—"} / ${mapping.columnMap?.paidOut || "—"}`}</small>
                        <small>Balance: {mapping.columnMap?.balance || "—"}</small>
                        <small>Default account: {mapping.accountId ? getAccountName(mapping.accountId) : "None"}</small>
                      </div>
                      <button className="secondary-button small" onClick={() => removeArrayItem("csvColumnMappings", mapping.id, "CSV column mapping")}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
