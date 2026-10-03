import { useEffect, useState } from "react";
import useFormErrors from "./useFormErrors.js";
import { checkMoneyAmount, collectErrors } from "../utils/validation.js";
import { getBudgetAccountIds } from "../utils/calculations.js";
import { createId } from "../utils/ids.js";
import { DEFAULT_ACCOUNT_ID } from "../data/defaultAccounts.js";

function validateBudgetForm(values) {
  return collectErrors({
    limit: checkMoneyAmount(values.limit, { required: false, allowZero: true, example: "120" })
  });
}

// Setting, archiving, restoring and deleting a category's monthly budget.
export default function useBudgetEditor({ actions, appData, setOpenBudgetKey }) {
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetLimit, setBudgetLimit] = useState("");
  const [budgetAccountIds, setBudgetAccountIds] = useState([DEFAULT_ACCOUNT_ID]);
  const budgetErrors = useFormErrors("budget", validateBudgetForm);

  useEffect(() => {
    budgetErrors.clearFixedErrors({ limit: budgetLimit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetLimit]);

  // Looks up any existing budget row for this category/month, including a
  // disabled one (limit 0, not yet shown on the Category limits list) — so
  // opening the editor always re-seeds whichever accounts were actually
  // saved, rather than falling back to a single default account just
  // because no limit has been set yet.
  function getCurrentBudgetForCategory(categoryId) {
    return (appData.budgets || []).find(budget => (
      budget.categoryId === categoryId
      && budget.month === actions.selectedMonth
      && !budget.isArchived
      && !budget.archivedAt
    )) || null;
  }

  function toggleBudgetAccount(accountId) {
    setBudgetAccountIds(prev => {
      const has = prev.includes(accountId);
      return has ? prev.filter(id => id !== accountId) : [...prev, accountId];
    });
  }

  function handleEditBudget(budgetItem) {
    setEditingBudget(budgetItem);
    setBudgetLimit(budgetItem.limit?.toString() || "");
    const seededIds = budgetItem.accountIds
      || (budgetItem.budget ? getBudgetAccountIds(budgetItem.budget) : null)
      || [DEFAULT_ACCOUNT_ID];
    setBudgetAccountIds(seededIds);
  }

  function closeBudgetEditor() {
    setEditingBudget(null);
    budgetErrors.resetErrors();
  }

  function saveBudget() {
    if (!editingBudget) return;
    if (!budgetErrors.validateAll({ limit: budgetLimit })) return;
    const limit = parseFloat(budgetLimit) || 0;
    const accountIds = budgetAccountIds.length > 0 ? budgetAccountIds : [DEFAULT_ACCOUNT_ID];
    const accountIdsKey = [...accountIds].sort().join("+");
    const existingBudget = editingBudget.budget
      ? appData.budgets.find(b => b.id === editingBudget.budget.id)
      : appData.budgets.find(
          b => b.categoryId === editingBudget.category.id &&
            b.month === actions.selectedMonth &&
            [...getBudgetAccountIds(b)].sort().join("+") === accountIdsKey &&
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
                accountIds,
                accountId: accountIds[0],
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
            accountIds,
            accountId: accountIds[0],
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
    setBudgetAccountIds([DEFAULT_ACCOUNT_ID]);
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

  return {
    archiveBudget,
    budgetAccountIds,
    budgetErrors,
    budgetLimit,
    closeBudgetEditor,
    editingBudget,
    getCurrentBudgetForCategory,
    handleEditBudget,
    permanentlyDeleteBudget,
    restoreBudget,
    saveBudget,
    setBudgetLimit,
    toggleBudgetAccount
  };
}
