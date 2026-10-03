import { getBudgetAccountIds } from "../utils/calculations.js";

export function isAccountArchived(account) {
  return account?.isActive === false;
}

// What still points at this account. Transactions, balance adjustments and
// active bills are money history or future payments, so they block a
// permanent delete; everything else is tidied up automatically.
function getAccountUsage(data, accountId) {
  const transactions = (data.transactions || []).filter(txn => txn.accountId === accountId).length;
  const adjustments = (data.accountAdjustments || []).filter(adj => adj.accountId === accountId).length;
  const activeBills = (data.recurringItems || [])
    .filter(item => item.accountId === accountId && item.isActive !== false && !item.archivedAt).length;
  return { transactions, adjustments, activeBills };
}

export function getAccountDeleteBlocker(data, account) {
  if (account.isDefault) return "Built-in accounts can be archived but not deleted.";

  const { transactions, adjustments, activeBills } = getAccountUsage(data, account.id);
  const reasons = [
    transactions ? `${transactions} transaction${transactions === 1 ? "" : "s"}` : "",
    adjustments ? `${adjustments} balance adjustment${adjustments === 1 ? "" : "s"}` : "",
    activeBills ? `${activeBills} active bill${activeBills === 1 ? "" : "s"}` : ""
  ].filter(Boolean);
  if (!reasons.length) return "";
  return `Still has ${reasons.join(", ")}. Move or delete those first, then you can delete the account.`;
}

export function setAccountArchived(data, accountId, archived) {
  const now = new Date().toISOString();
  return {
    ...data,
    accounts: (data.accounts || []).map(account => (
      account.id === accountId
        ? { ...account, isActive: !archived, archivedAt: archived ? now : null, updatedAt: now }
        : account
    ))
  };
}

// Only call when getAccountDeleteBlocker returns "". Removes the account and
// any rules or links that would otherwise point at a missing account.
export function deleteAccountPermanently(data, accountId) {
  const now = new Date().toISOString();
  const budgets = (data.budgets || []).flatMap(budget => {
    const accountIds = getBudgetAccountIds(budget);
    if (!accountIds.includes(accountId)) return [budget];
    const remaining = accountIds.filter(id => id !== accountId);
    if (!remaining.length) return [];
    return [{ ...budget, accountIds: remaining, accountId: remaining[0], updatedAt: now }];
  });

  return {
    ...data,
    accounts: (data.accounts || []).filter(account => account.id !== accountId),
    budgets,
    recurringItems: (data.recurringItems || []).filter(item => item.accountId !== accountId),
    savingsGoals: (data.savingsGoals || []).map(goal => (
      goal.linkedAccountId === accountId ? { ...goal, linkedAccountId: null, updatedAt: now } : goal
    )),
    transferRules: (data.transferRules || []).filter(rule => rule.uploadedAccountId !== accountId && rule.linkedAccountId !== accountId),
    externalAccountMappings: (data.externalAccountMappings || []).filter(mapping => mapping.gbAccountId !== accountId),
    csvColumnMappings: (data.csvColumnMappings || []).filter(mapping => mapping.accountId !== accountId)
  };
}
