import { getBudgetAccountIds } from "../utils/calculations.js";
import { NO_BUDGET_ID } from "../utils/budgetMembership.js";

// Saves the tick boxes from Budgets > "Add transactions".
//
// `budget` is the budget row being edited and `selectedIds` is every
// transaction ticked when SAVE was pressed. `initialIds` is what was ticked
// when the page opened (everything already counting toward this budget).
//
// - Newly ticked: pinned to this budget. That moves it out of any other
//   budget it was counting toward, because a transaction is in one budget.
// - Newly unticked: if it only counted here by matching category and account,
//   it is taken out of budgets (NO_BUDGET_ID), otherwise it goes back to
//   automatic.
export function applyBudgetSelection(data, budget, selectedIds, initialIds) {
  const selected = new Set(selectedIds);
  const initial = new Set(initialIds);
  const accountIds = getBudgetAccountIds(budget);
  const now = new Date().toISOString();
  let changed = false;

  const transactions = (data.transactions || []).map(transaction => {
    const isSelected = selected.has(transaction.id);
    const wasSelected = initial.has(transaction.id);
    if (isSelected === wasSelected) return transaction;

    changed = true;
    if (isSelected) {
      return { ...transaction, budgetId: budget.id, updatedAt: now };
    }

    const matchesAutomatically = transaction.categoryId === budget.categoryId && accountIds.includes(transaction.accountId);
    return { ...transaction, budgetId: matchesAutomatically ? NO_BUDGET_ID : null, updatedAt: now };
  });

  return changed ? { ...data, transactions } : data;
}
