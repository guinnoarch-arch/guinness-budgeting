import { useState } from "react";
import BudgetCard from "../components/budgets/BudgetCard.jsx";
import { getCategorySpend } from "../utils/calculations.js";
import { createId } from "../utils/ids.js";
import { formatMoney } from "../utils/money.js";

function isCategoryArchived(category) {
  return category.isActive === false || category.isArchived || category.archivedAt;
}

function fallbackCategoryId(categories, category) {
  const preferredIds = category.type === "income"
    ? ["cat_other_income", "cat_refund", "cat_gift"]
    : ["cat_other_expense", "cat_everything_else", "cat_shopping"];

  const preferred = preferredIds.find(id => id !== category.id && categories.some(item => item.id === id));
  if (preferred) return preferred;

  return categories.find(item => item.id !== category.id && item.type === category.type)?.id || null;
}

export default function BudgetsPage({ appData, actions }) {
  const [editingBudget, setEditingBudget] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [budgetLimit, setBudgetLimit] = useState("");
  const [budgetAccountId, setBudgetAccountId] = useState("acc_current");
  const [categoryName, setCategoryName] = useState("");
  const [openBudgetKey, setOpenBudgetKey] = useState(null);
  const [showBudgetManager, setShowBudgetManager] = useState(false);
  const [newCategoryDraft, setNewCategoryDraft] = useState({
    name: "",
    type: "expense",
    group: "Other",
    limit: "",
    accountId: "acc_current"
  });

  const activeAccounts = (appData.accounts || []).filter(account => account.isActive !== false);
  const categorySpend = getCategorySpend(appData, actions.selectedMonth)
    .filter(item => item.spent > 0 || item.excludedSpent > 0 || item.limit > 0);

  const archivedBudgets = (appData.budgets || [])
    .filter(budget => budget.isArchived || budget.archivedAt)
    .map(budget => ({
      ...budget,
      category: appData.categories.find(category => category.id === budget.categoryId),
      account: appData.accounts.find(account => account.id === (budget.accountId || "acc_current"))
    }))
    .sort((a, b) => String(b.archivedAt || b.month).localeCompare(String(a.archivedAt || a.month)));

  const archivedCategories = (appData.categories || [])
    .filter(isCategoryArchived)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const activeMonthlyBudgets = (appData.budgets || [])
    .filter(budget => budget.month === actions.selectedMonth && budget.isEnabled !== false && !budget.isArchived && !budget.archivedAt);
  const totalBudgetAmount = activeMonthlyBudgets.reduce((sum, budget) => sum + Number(budget.limit || 0), 0);
  const activeManagerCategories = (appData.categories || [])
    .filter(category => category.isActive !== false && !category.isArchived && !category.archivedAt)
    .sort((a, b) => `${a.type}-${a.group || ""}-${a.name || ""}`.localeCompare(`${b.type}-${b.group || ""}-${b.name || ""}`));

  function getCurrentBudgetForCategory(categoryId) {
    return activeMonthlyBudgets.find(budget => budget.categoryId === categoryId) || null;
  }

  function updateNewCategoryDraft(field, value) {
    setNewCategoryDraft(prev => ({ ...prev, [field]: value }));
  }

  function addCategoryFromManager(event) {
    event.preventDefault();
    const name = newCategoryDraft.name.trim();
    if (!name) return;

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
    if (nextCategory.type === "expense" && limit > 0) {
      nextBudgets.push({
        id: createId("bud"),
        categoryId,
        accountId: newCategoryDraft.accountId || activeAccounts[0]?.id || "acc_current",
        month: actions.selectedMonth,
        limit,
        isEnabled: true,
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

    setNewCategoryDraft({ name: "", type: "expense", group: "Other", limit: "", accountId: activeAccounts[0]?.id || "acc_current" });
  }

  function openBudgetEditorFromManager(category) {
    const budget = getCurrentBudgetForCategory(category.id);
    setShowBudgetManager(false);
    handleEditBudget({
      category,
      budget,
      limit: Number(budget?.limit || 0),
      accountId: budget?.accountId || activeAccounts[0]?.id || "acc_current"
    });
  }

  function openCategoryEditorFromManager(category) {
    setShowBudgetManager(false);
    handleEditCategory(category);
  }

  function handleEditBudget(budgetItem) {
    setEditingBudget(budgetItem);
    setBudgetLimit(budgetItem.limit?.toString() || "");
    setBudgetAccountId(budgetItem.accountId || budgetItem.budget?.accountId || "acc_current");
  }

  function handleEditCategory(category) {
    setEditingCategory(category);
    setCategoryName(category.name);
  }

  function saveBudget() {
    if (!editingBudget) return;
    const limit = parseFloat(budgetLimit) || 0;
    const existingBudget = editingBudget.budget
      ? appData.budgets.find(b => b.id === editingBudget.budget.id)
      : appData.budgets.find(
          b => b.categoryId === editingBudget.category.id &&
            b.month === actions.selectedMonth &&
            (b.accountId || "acc_current") === budgetAccountId &&
            !b.isArchived &&
            !b.archivedAt
        );

    if (existingBudget) {
      actions.updateAppData({
        ...appData,
        budgets: appData.budgets.map(b =>
          b.id === existingBudget.id
            ? {
                ...b,
                accountId: budgetAccountId,
                limit,
                isEnabled: limit > 0,
                isArchived: false,
                archivedAt: null,
                updatedAt: new Date().toISOString()
              }
            : b
        )
      }, { reason: "Budget edited" });
    } else {
      actions.updateAppData({
        ...appData,
        budgets: [
          ...appData.budgets,
          {
            id: createId("bud"),
            categoryId: editingBudget.category.id,
            accountId: budgetAccountId,
            month: actions.selectedMonth,
            limit,
            isEnabled: limit > 0,
            isArchived: false,
            archivedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      }, { reason: "Budget added" });
    }
    setEditingBudget(null);
    setBudgetLimit("");
    setBudgetAccountId("acc_current");
  }

  function archiveBudget(budgetItem) {
    if (!budgetItem?.budget) return false;
    const confirmed = window.confirm(
      `Archive the ${budgetItem.category.name} budget? Past transactions and archived budget history will stay unchanged.`
    );
    if (!confirmed) return false;

    actions.updateAppData({
      ...appData,
      budgets: appData.budgets.map(budget =>
        budget.id === budgetItem.budget.id
          ? {
              ...budget,
              isEnabled: false,
              isArchived: true,
              archivedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          : budget
      )
    }, { reason: "Budget archived" });
    setOpenBudgetKey(null);
    return true;
  }

  function restoreBudget(budget) {
    actions.updateAppData({
      ...appData,
      budgets: appData.budgets.map(existing =>
        existing.id === budget.id
          ? {
              ...existing,
              isEnabled: true,
              isArchived: false,
              archivedAt: null,
              updatedAt: new Date().toISOString()
            }
          : existing
      )
    }, { reason: "Budget restored" });
  }

  function permanentlyDeleteBudget(budget) {
    if (!window.confirm(`Permanently delete the archived ${budget.category?.name || "category"} budget for ${budget.month}? This will not delete any transactions.`)) return;
    actions.updateAppData({
      ...appData,
      budgets: appData.budgets.filter(existing => existing.id !== budget.id)
    }, { reason: "Archived budget permanently deleted" });
  }

  function saveCategory() {
    if (!editingCategory || !categoryName.trim()) return;
    actions.updateAppData({
      ...appData,
      categories: appData.categories.map(c =>
        c.id === editingCategory.id
          ? { ...c, name: categoryName.trim(), isActive: true, isArchived: false, archivedAt: null, updatedAt: new Date().toISOString() }
          : c
      )
    }, { reason: "Category edited" });
    setEditingCategory(null);
    setCategoryName("");
  }

  function archiveCategory(category) {
    if (!category) return;
    const activeBudgetCount = appData.budgets.filter(budget => budget.categoryId === category.id && !budget.isArchived && !budget.archivedAt).length;
    const detail = activeBudgetCount > 0 ? `\n\n${activeBudgetCount} active budget(s) using this category will also be archived.` : "";
    if (!window.confirm(`Archive the ${category.name} category? Existing transactions will keep this category for history.${detail}`)) return;

    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      categories: appData.categories.map(item => (
        item.id === category.id
          ? { ...item, isActive: false, isArchived: true, archivedAt: now, updatedAt: now }
          : item
      )),
      budgets: appData.budgets.map(budget => (
        budget.categoryId === category.id && !budget.isArchived && !budget.archivedAt
          ? { ...budget, isEnabled: false, isArchived: true, archivedAt: now, updatedAt: now }
          : budget
      ))
    }, { reason: "Category archived" });
  }

  function restoreCategory(category) {
    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      categories: appData.categories.map(item => (
        item.id === category.id
          ? { ...item, isActive: true, isArchived: false, archivedAt: null, updatedAt: now }
          : item
      )),
      settings: {
        ...(appData.settings || {}),
        deletedDefaultCategoryIds: (appData.settings?.deletedDefaultCategoryIds || []).filter(id => id !== category.id)
      }
    }, { reason: "Category restored" });
  }

  function permanentlyDeleteCategory(category) {
    const linkedTransactions = appData.transactions.filter(txn => txn.categoryId === category.id).length;
    const linkedBudgets = appData.budgets.filter(budget => budget.categoryId === category.id).length;
    const replacementCategoryId = fallbackCategoryId(appData.categories, category);
    const replacement = appData.categories.find(item => item.id === replacementCategoryId);
    const moveText = linkedTransactions > 0
      ? `\n\n${linkedTransactions} transaction(s) will be moved to ${replacement?.name || "no category"}.`
      : "";
    const budgetText = linkedBudgets > 0 ? `\n${linkedBudgets} budget record(s) using this category will be removed.` : "";

    if (!window.confirm(`Permanently delete the archived ${category.name} category? This cannot be undone.${moveText}${budgetText}`)) return;

    const deletedDefaultCategoryIds = category.isDefault
      ? [...new Set([...(appData.settings?.deletedDefaultCategoryIds || []), category.id])]
      : (appData.settings?.deletedDefaultCategoryIds || []);

    actions.updateAppData({
      ...appData,
      categories: appData.categories.filter(item => item.id !== category.id),
      transactions: appData.transactions.map(txn => (
        txn.categoryId === category.id ? { ...txn, categoryId: replacementCategoryId, updatedAt: new Date().toISOString() } : txn
      )),
      budgets: appData.budgets.filter(budget => budget.categoryId !== category.id),
      importRules: (appData.importRules || []).filter(rule => rule.categoryId !== category.id),
      settings: {
        ...(appData.settings || {}),
        deletedDefaultCategoryIds
      }
    }, { reason: "Archived category permanently deleted" });
  }

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Budgets</p>
          <h2>Category limits</h2>
          <p className="muted-text">Archive budgets or categories without removing old transactions. Edit transactions directly from a budget when something is in the wrong place.</p>
        </div>
        <div className="budget-title-actions">
          <div className="mini-total-card">
            <span>Total budgets this month</span>
            <strong>{formatMoney(totalBudgetAmount)}</strong>
          </div>
          <button type="button" className="secondary-button" onClick={() => setShowBudgetManager(true)}>Manage categories & budgets</button>
        </div>
      </div>

      <div className="budget-grid">
        {categorySpend.map(item => {
          const budgetKey = item.id || `${item.category.id}_${item.accountId || "all"}`;
          const recentTransactions = appData.transactions
            .filter(txn => txn.categoryId === item.category.id && txn.type === "expense")
            .filter(txn => !item.accountId || txn.accountId === item.accountId)
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
            <p className="muted-text">Old budget limits are kept here for reference. Transactions are not removed.</p>
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
                  <small>{budget.month} · {budget.account?.name || "Current Account"} · archived {budget.archivedAt ? budget.archivedAt.slice(0, 10) : ""}</small>
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
            <p className="muted-text">Archived categories are hidden from new transactions and budget warnings. Delete permanently only when you no longer need the category itself.</p>
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
        <div className="modal-backdrop">
          <div className="modal-card wide-modal-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">Budget manager</p>
                <h2>Categories and budgets</h2>
                <p className="muted-text">One place to add categories, set this month’s limits, edit names, and archive old categories.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowBudgetManager(false)}>×</button>
            </div>

            <form className="manager-add-form" onSubmit={addCategoryFromManager}>
              <label>
                New category
                <input
                  type="text"
                  placeholder="Car insurance"
                  value={newCategoryDraft.name}
                  onChange={event => updateNewCategoryDraft("name", event.target.value)}
                />
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
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newCategoryDraft.limit}
                  onChange={event => updateNewCategoryDraft("limit", event.target.value)}
                  disabled={newCategoryDraft.type !== "expense"}
                />
              </label>
              <label>
                Account
                <select
                  value={newCategoryDraft.accountId}
                  onChange={event => updateNewCategoryDraft("accountId", event.target.value)}
                  disabled={newCategoryDraft.type !== "expense"}
                >
                  {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <button className="primary-button">Add</button>
            </form>

            <div className="budget-manager-list">
              {activeManagerCategories.map(category => {
                const budget = getCurrentBudgetForCategory(category.id);
                const account = activeAccounts.find(item => item.id === (budget?.accountId || "acc_current"));
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
                          <small>{budget ? `${actions.selectedMonth} · ${account?.name || "Current Account"}` : "Tracked, but no warning limit"}</small>
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
      )}

      {editingBudget && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={e => { e.preventDefault(); saveBudget(); }}>
            <div className="section-header">
              <h2>Edit budget for {editingBudget.category.name}</h2>
              <button type="button" className="icon-button" onClick={() => setEditingBudget(null)}>×</button>
            </div>

            <div className="form-grid">
              <label>
                Budget limit
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="100.00"
                  value={budgetLimit}
                  onChange={e => setBudgetLimit(e.target.value)}
                />
              </label>

              <label>
                Linked account
                <select value={budgetAccountId} onChange={e => setBudgetAccountId(e.target.value)}>
                  {activeAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                <small>This budget only appears for this account, plus the All accounts view.</small>
              </label>
            </div>

            <div className="modal-actions split-modal-actions">
              <div>
                {editingBudget.budget && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      if (archiveBudget(editingBudget)) setEditingBudget(null);
                    }}
                  >
                    Archive budget
                  </button>
                )}
              </div>
              <div className="row-actions">
                <button type="button" className="secondary-button" onClick={() => setEditingBudget(null)}>Cancel</button>
                <button className="primary-button">Save budget</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {editingCategory && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={e => { e.preventDefault(); saveCategory(); }}>
            <div className="section-header">
              <h2>Edit category</h2>
              <button type="button" className="icon-button" onClick={() => setEditingCategory(null)}>×</button>
            </div>

            <div className="form-grid">
              <label>
                Category name
                <input
                  type="text"
                  placeholder="Category name"
                  value={categoryName}
                  onChange={e => setCategoryName(e.target.value)}
                />
              </label>
            </div>

            <div className="modal-actions split-modal-actions">
              <div>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (archiveCategory(editingCategory)) setEditingCategory(null);
                  }}
                >
                  Archive category
                </button>
              </div>
              <div className="row-actions">
                <button type="button" className="secondary-button" onClick={() => setEditingCategory(null)}>Cancel</button>
                <button className="primary-button">Save category</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
