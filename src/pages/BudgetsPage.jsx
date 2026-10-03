import { useEffect, useState } from "react";
import { checkMoneyAmount, checkRequiredText, collectErrors } from "../utils/validation.js";
import useFormErrors from "../hooks/useFormErrors.js";
import BudgetCard from "../components/budgets/BudgetCard.jsx";
import { getCategorySpend, getBudgetAccountIds } from "../utils/calculations.js";
import { createId } from "../utils/ids.js";
import { formatMonthLabel } from "../utils/dates.js";
import { formatMoney } from "../utils/money.js";
import { applyCategoryRules, undoCategoryRuleChanges } from "../services/transactionService.js";
import { DEFAULT_ACCOUNT_ID } from "../data/defaultAccounts.js";
import { BudgetManagerModal } from "../components/budgets/BudgetManagerModal.jsx";
import { BudgetEditorModal } from "../components/budgets/BudgetEditorModal.jsx";
import { CategoryEditorModal } from "../components/budgets/CategoryEditorModal.jsx";
import useBudgetEditor from "../hooks/useBudgetEditor.js";
import useCategoryEditor from "../hooks/useCategoryEditor.js";

function validateNewCategoryForm(values) {
  return collectErrors({
    name: checkRequiredText(values.name, "a name for the category, for example Car insurance"),
    limit: values.type === "expense" ? checkMoneyAmount(values.limit, { required: false, allowZero: true, example: "120" }) : ""
  });
}

function isCategoryArchived(category) {
  return category.isActive === false || category.isArchived || category.archivedAt;
}

export default function BudgetsPage({ appData, actions }) {
  const [openBudgetKey, setOpenBudgetKey] = useState(null);
  const { archiveBudget, budgetAccountIds, budgetErrors, budgetLimit, closeBudgetEditor, editingBudget, getCurrentBudgetForCategory, handleEditBudget, permanentlyDeleteBudget, restoreBudget, saveBudget, setBudgetLimit, toggleBudgetAccount } = useBudgetEditor({ actions, appData, setOpenBudgetKey });
  const [showBudgetManager, setShowBudgetManager] = useState(false);
  const [categoryRefreshStatus, setCategoryRefreshStatus] = useState("");
  const [lastCategoryRuleChanges, setLastCategoryRuleChanges] = useState(null);
  const [newCategoryDraft, setNewCategoryDraft] = useState({
    name: "",
    type: "expense",
    group: "Other",
    limit: "",
    accountIds: [DEFAULT_ACCOUNT_ID]
  });

  const newCategoryErrors = useFormErrors("new-category", validateNewCategoryForm);

  useEffect(() => {
    newCategoryErrors.clearFixedErrors(newCategoryDraft);
    // Only re-check when the values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newCategoryDraft]);

  const activeAccounts = (appData.accounts || []).filter(account => account.isActive !== false);
  const categorySpend = getCategorySpend(appData, actions.selectedMonth)
    .filter(item => item.spent > 0 || item.excludedSpent > 0 || item.limit > 0);

  const archivedBudgets = (appData.budgets || [])
    .filter(budget => budget.isArchived || budget.archivedAt)
    .map(budget => ({
      ...budget,
      category: appData.categories.find(category => category.id === budget.categoryId),
      accounts: getBudgetAccountIds(budget).map(id => appData.accounts.find(account => account.id === id)).filter(Boolean)
    }))
    .sort((a, b) => String(b.archivedAt || b.month).localeCompare(String(a.archivedAt || a.month)));

  const archivedCategories = (appData.categories || [])
    .filter(isCategoryArchived)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const activeMonthlyBudgets = (appData.budgets || [])
    .filter(budget => budget.month === actions.selectedMonth && budget.isEnabled !== false && !budget.isArchived && !budget.archivedAt);
  const totalBudgetAmount = activeMonthlyBudgets.reduce((sum, budget) => sum + Number(budget.limit || 0), 0);
  const flexibleRemaining = categorySpend
    .filter(item => item.category?.type !== "income")
    .reduce((sum, item) => sum + Math.max(0, Number(item.limit || 0) - Number(item.spent || 0)), 0);
  const now = new Date();
  const { archiveCategory, categoryName, categoryNameErrors, closeCategoryEditor, editingCategory, handleEditCategory, permanentlyDeleteCategory, restoreCategory, saveCategory, setCategoryName } = useCategoryEditor({ actions, appData });
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthEnd = new Date(Number(actions.selectedMonth.slice(0, 4)), Number(actions.selectedMonth.slice(5, 7)), 0);
  const daysLeft = actions.selectedMonth === currentMonthKey
    ? Math.max(1, monthEnd.getDate() - now.getDate() + 1)
    : Math.max(1, monthEnd.getDate());
  const safeDailySpend = flexibleRemaining / daysLeft;
  const activeManagerCategories = (appData.categories || [])
    .filter(category => category.isActive !== false && !category.isArchived && !category.archivedAt)
    .sort((a, b) => `${a.type}-${a.group || ""}-${a.name || ""}`.localeCompare(`${b.type}-${b.group || ""}-${b.name || ""}`));

  function refreshCategorisation() {
    const usableRules = (appData.importRules || []).filter(rule => (rule.matchText || "").trim() && rule.categoryId);
    if (!usableRules.length) {
      setCategoryRefreshStatus('No category match texts saved yet — add some (e.g. "Tesco" → Food) in Settings first.');
      setLastCategoryRuleChanges(null);
      return;
    }
    const { data: nextData, updatedCount, changes } = applyCategoryRules(appData);
    actions.updateAppData(nextData, { reason: "Category rules refreshed" });
    setLastCategoryRuleChanges(updatedCount > 0 ? changes : null);
    setCategoryRefreshStatus(
      updatedCount > 0
        ? `Refreshed — recategorised ${updatedCount} transaction${updatedCount === 1 ? "" : "s"}.`
        : "Refreshed — nothing needed recategorising."
    );
  }

  function undoCategoryRefresh() {
    if (!lastCategoryRuleChanges || !lastCategoryRuleChanges.length) return;
    const nextData = undoCategoryRuleChanges(appData, lastCategoryRuleChanges);
    actions.updateAppData(nextData, { reason: "Category refresh undone" });
    setCategoryRefreshStatus(`Undone — reverted ${lastCategoryRuleChanges.length} transaction${lastCategoryRuleChanges.length === 1 ? "" : "s"} to their previous category.`);
    setLastCategoryRuleChanges(null);
  }

  function updateNewCategoryDraft(field, value) {
    setNewCategoryDraft(prev => ({ ...prev, [field]: value }));
  }

  function toggleNewCategoryAccount(accountId) {
    setNewCategoryDraft(prev => {
      const has = prev.accountIds.includes(accountId);
      const nextIds = has ? prev.accountIds.filter(id => id !== accountId) : [...prev.accountIds, accountId];
      return { ...prev, accountIds: nextIds };
    });
  }

  function addCategoryFromManager(event) {
    event.preventDefault();
    if (!newCategoryErrors.validateAll(newCategoryDraft)) return;
    const name = newCategoryDraft.name.trim();

    const now = new Date().toISOString();
    const categoryId = createId("cat");
    const limit = Number(newCategoryDraft.limit || 0);
    const nextCategory = {
      id: categoryId,
      name,
      type: newCategoryDraft.type,
      group: newCategoryDraft.group || (newCategoryDraft.type === "income" ? "Income" : "Other"),
      isDefault: false,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    const nextBudgets = [...(appData.budgets || [])];
    if (nextCategory.type === "expense") {
      // Always save a budget row once the category is created, even with no
      // limit set yet (isEnabled follows limit > 0, same as editing an
      // existing budget) — otherwise a limit of 0 silently discards which
      // accounts were ticked, since there'd be nothing left to hold them.
      const accountIds = newCategoryDraft.accountIds.length > 0 ? newCategoryDraft.accountIds : [activeAccounts[0]?.id || DEFAULT_ACCOUNT_ID];
      nextBudgets.push({
        id: createId("bud"),
        categoryId,
        accountIds,
        accountId: accountIds[0],
        month: actions.selectedMonth,
        limit,
        isEnabled: limit > 0,
        isArchived: false,
        archivedAt: null,
        createdAt: now,
        updatedAt: now
      });
    }

    actions.updateAppData({
      ...appData,
      categories: [...(appData.categories || []), nextCategory],
      budgets: nextBudgets
    }, { reason: "Category and budget added" });

    setNewCategoryDraft({ name: "", type: "expense", group: "Other", limit: "", accountIds: [activeAccounts[0]?.id || DEFAULT_ACCOUNT_ID] });
  }

  function openBudgetEditorFromManager(category) {
    const budget = getCurrentBudgetForCategory(category.id);
    setShowBudgetManager(false);
    handleEditBudget({
      category,
      budget,
      limit: Number(budget?.limit || 0),
      accountIds: budget ? getBudgetAccountIds(budget) : [activeAccounts[0]?.id || DEFAULT_ACCOUNT_ID]
    });
  }

  function openCategoryEditorFromManager(category) {
    setShowBudgetManager(false);
    handleEditCategory(category);
  }

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Budgets</p>
          <h2>Category limits</h2>
        </div>
        <div className="budget-title-actions">
          <div className="mini-total-card">
            <span>Total budgets this month</span>
            <strong>{formatMoney(totalBudgetAmount)}</strong>
          </div>
          <div className="mini-total-card">
            <span>Safe daily flexible spend</span>
            <strong>{formatMoney(safeDailySpend)}</strong>
          </div>
          <button type="button" className="secondary-button" onClick={() => setShowBudgetManager(true)}>Manage categories & budgets</button>
        </div>
      </div>

      <section className="card category-refresh-card">
        <div className="section-header compact-header">
          <div>
            <h3>Refresh categorisation</h3>
            <p className="muted-text">Re-applies your category match texts to every transaction. Ones you've moved by hand are left alone.</p>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={() => actions.setActivePage("settings")}>Manage category match texts</button>
            <button type="button" className="primary-button" onClick={refreshCategorisation}>Refresh now</button>
          </div>
        </div>
        {categoryRefreshStatus && (
          <div className="import-status-box">
            {categoryRefreshStatus}
            {lastCategoryRuleChanges && lastCategoryRuleChanges.length > 0 && (
              <button type="button" className="secondary-button small" onClick={undoCategoryRefresh}>
                Undo last refresh ({lastCategoryRuleChanges.length})
              </button>
            )}
          </div>
        )}
      </section>

      {categorySpend.length === 0 && (
        <section className="card empty-state-card">
          <h3>No budgets for {formatMonthLabel(actions.selectedMonth)} yet</h3>
          <p className="muted">Create one to start tracking spending. Set a monthly limit for a category, and its spending shows here as it comes in.</p>
          <div className="row-actions">
            <button type="button" className="primary-button" onClick={() => setShowBudgetManager(true)}>Create a budget</button>
          </div>
        </section>
      )}

      <div className="budget-grid">
        {categorySpend.map(item => {
          const budgetKey = item.id || `${item.category.id}_${(item.accountIds || []).join("+") || "all"}`;
          const recentTransactions = appData.transactions
            .filter(txn => txn.categoryId === item.category.id && txn.type === "expense")
            .filter(txn => !(item.accountIds?.length) || item.accountIds.includes(txn.accountId))
            .sort((a, b) => b.date.localeCompare(a.date));

          return (
            <BudgetCard
              key={budgetKey}
              item={item}
              recentTransactions={recentTransactions}
              isOpen={openBudgetKey === budgetKey}
              onToggle={() => setOpenBudgetKey(prev => prev === budgetKey ? null : budgetKey)}
              onEditBudget={handleEditBudget}
              onEditCategory={handleEditCategory}
              onEditTransaction={actions.openEditTransaction}
            />
          );
        })}
      </div>

      <section className="card archived-budget-card">
        <div className="section-header compact-header">
          <div>
            <h3>Archived budgets</h3>
          </div>
        </div>

        {archivedBudgets.length === 0 ? (
          <p className="muted">No archived budgets yet.</p>
        ) : (
          <div className="archive-list">
            {archivedBudgets.map(budget => (
              <div key={budget.id} className="archive-row">
                <div>
                  <strong>{budget.category?.name || "Unknown category"}</strong>
                  <small>{budget.month} · {(budget.accounts || []).map(account => account.name).join(", ") || "Current Account"} · archived {budget.archivedAt ? budget.archivedAt.slice(0, 10) : ""}</small>
                </div>
                <div className="row-actions archive-row-actions">
                  <strong>{formatMoney(budget.limit)}</strong>
                  <button type="button" className="secondary-button" onClick={() => restoreBudget(budget)}>Restore</button>
                  <button type="button" className="danger-button" onClick={() => permanentlyDeleteBudget(budget)}>Delete permanently</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card archived-card">
        <div className="section-header compact-header">
          <div>
            <h3>Archived categories</h3>
          </div>
        </div>

        {archivedCategories.length === 0 ? (
          <p className="muted">No archived categories yet.</p>
        ) : (
          <div className="archive-list">
            {archivedCategories.map(category => {
              const transactionCount = appData.transactions.filter(txn => txn.categoryId === category.id).length;
              return (
                <div key={category.id} className="archive-row">
                  <div>
                    <strong>{category.name}</strong>
                    <small>{category.type} · {category.group || "No group"} · {transactionCount} linked transaction(s){category.archivedAt ? ` · archived ${category.archivedAt.slice(0, 10)}` : ""}</small>
                  </div>
                  <div className="row-actions archive-row-actions">
                    <button type="button" className="secondary-button" onClick={() => restoreCategory(category)}>Restore</button>
                    <button type="button" className="danger-button" onClick={() => permanentlyDeleteCategory(category)}>Delete permanently</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showBudgetManager && (
        <BudgetManagerModal
          actions={actions}
          activeAccounts={activeAccounts}
          activeManagerCategories={activeManagerCategories}
          addCategoryFromManager={addCategoryFromManager}
          archiveCategory={archiveCategory}
          getCurrentBudgetForCategory={getCurrentBudgetForCategory}
          newCategoryDraft={newCategoryDraft}
          newCategoryErrors={newCategoryErrors}
          openBudgetEditorFromManager={openBudgetEditorFromManager}
          openCategoryEditorFromManager={openCategoryEditorFromManager}
          setShowBudgetManager={setShowBudgetManager}
          toggleNewCategoryAccount={toggleNewCategoryAccount}
          updateNewCategoryDraft={updateNewCategoryDraft}
        />
      )}

      {editingBudget && (
        <BudgetEditorModal
          activeAccounts={activeAccounts}
          archiveBudget={archiveBudget}
          budgetAccountIds={budgetAccountIds}
          budgetErrors={budgetErrors}
          budgetLimit={budgetLimit}
          closeBudgetEditor={closeBudgetEditor}
          editingBudget={editingBudget}
          saveBudget={saveBudget}
          setBudgetLimit={setBudgetLimit}
          toggleBudgetAccount={toggleBudgetAccount}
        />
      )}

      {editingCategory && (
        <CategoryEditorModal
          archiveCategory={archiveCategory}
          categoryName={categoryName}
          categoryNameErrors={categoryNameErrors}
          closeCategoryEditor={closeCategoryEditor}
          editingCategory={editingCategory}
          saveCategory={saveCategory}
          setCategoryName={setCategoryName}
        />
      )}
    </div>
  );
}
