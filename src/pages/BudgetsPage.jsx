import { useState } from "react";
import BudgetCard from "../components/budgets/BudgetCard.jsx";
import { getCategorySpend } from "../utils/calculations.js";
import { createId } from "../utils/ids.js";
import { formatMoney } from "../utils/money.js";

export default function BudgetsPage({ appData, actions }) {
  const [editingBudget, setEditingBudget] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [budgetLimit, setBudgetLimit] = useState("");
  const [budgetAccountId, setBudgetAccountId] = useState("acc_current");
  const [categoryName, setCategoryName] = useState("");

  const activeAccounts = appData.accounts.filter(account => account.isActive);
  const categorySpend = getCategorySpend(appData, actions.selectedMonth)
    .filter(item => item.spent > 0 || item.limit > 0);

  const archivedBudgets = (appData.budgets || [])
    .filter(budget => budget.isArchived || budget.archivedAt)
    .map(budget => ({
      ...budget,
      category: appData.categories.find(category => category.id === budget.categoryId),
      account: appData.accounts.find(account => account.id === (budget.accountId || "acc_current"))
    }))
    .sort((a, b) => String(b.archivedAt || b.month).localeCompare(String(a.archivedAt || a.month)));

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
      });
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
      });
    }
    setEditingBudget(null);
    setBudgetLimit("");
    setBudgetAccountId("acc_current");
  }

  function archiveBudget(budgetItem) {
    if (!budgetItem?.budget) return;
    const confirmed = window.confirm(
      `Archive the ${budgetItem.category.name} budget? Past transactions and archived budget history will stay unchanged.`
    );
    if (!confirmed) return;

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
    });
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
    });
  }

  function saveCategory() {
    if (!editingCategory || !categoryName.trim()) return;
    actions.updateAppData({
      ...appData,
      categories: appData.categories.map(c =>
        c.id === editingCategory.id ? { ...c, name: categoryName, updatedAt: new Date().toISOString() } : c
      )
    });
    setEditingCategory(null);
    setCategoryName("");
  }

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Budgets</p>
          <h2>Category limits</h2>
          <p className="muted-text">Archive a budget to remove it from warnings without touching old transactions.</p>
        </div>
      </div>

      <div className="budget-grid">
        {categorySpend.map(item => {
          const recentTransactions = appData.transactions
            .filter(txn => txn.categoryId === item.category.id && txn.type === "expense")
            .filter(txn => !item.accountId || txn.accountId === item.accountId)
            .sort((a, b) => b.date.localeCompare(a.date));

          return (
            <BudgetCard
              key={item.id || `${item.category.id}_${item.accountId || "all"}`}
              item={item}
              recentTransactions={recentTransactions}
              onEditBudget={handleEditBudget}
              onArchiveBudget={archiveBudget}
              onEditCategory={handleEditCategory}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingBudget(null)}>Cancel</button>
              <button className="primary-button">Save budget</button>
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

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingCategory(null)}>Cancel</button>
              <button className="primary-button">Save category</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
