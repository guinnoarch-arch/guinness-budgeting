import { createId } from "../utils/ids.js";
import { removeHouseContributionForTransaction, syncHouseContributionForTransaction } from "../utils/houseTracking.js";
import { removeLoanEventsForTransaction, syncLoanEventsForTransaction } from "../utils/loanLinking.js";

export function upsertTransaction(data, formValues, existingId = null) {
  const now = new Date().toISOString();

  // "Transfer" is never a stored shape: it always produces two independent,
  // already-linked income/expense transactions rather than one record
  // spanning two accounts. Converting an existing transaction routes through
  // convertExistingToTransfer, which reuses its id for one leg (so a
  // receipt or import-batch link on it doesn't go stale) and creates a
  // fresh new leg for the other account.
  if (formValues.type === "transfer") {
    return existingId
      ? convertExistingToTransfer(data, formValues, existingId, now)
      : createTransferPair(data, formValues, now);
  }

  const shouldCreateRecurring = Boolean(formValues.isRecurring);
  const recurringItemId = formValues.recurringItemId || (shouldCreateRecurring ? createId("rec") : null);
  const existingTransaction = existingId
    ? data.transactions.find(item => item.id === existingId)
    : null;
  const transactionId = existingId || formValues.id || createId("txn");
  const linkedLoanId = formValues.type === "expense" ? formValues.linkedLoanId || null : null;
  const linkedHouseId = formValues.type === "expense" ? formValues.linkedHouseId || null : null;

  const transaction = {
    ...(existingTransaction || {}),
    id: transactionId,
    type: formValues.type,
    date: formValues.date,
    amount: Number(formValues.amount || 0),
    title: formValues.title || "Untitled transaction",
    note: formValues.note || "",
    categoryId: formValues.categoryId,
    accountId: formValues.accountId,
    linkedSavingsGoalId: formValues.type === "income" ? formValues.linkedSavingsGoalId || null : null,
    linkedLoanId,
    linkedHouseId,
    linkedHouseContributionId: formValues.linkedHouseContributionId || existingTransaction?.linkedHouseContributionId || null,
    houseContributionType: linkedHouseId ? formValues.houseContributionType || "mortgagePayment" : null,
    housePersonId: linkedHouseId ? formValues.housePersonId || null : null,
    housePersonName: linkedHouseId ? formValues.housePersonName || formValues.housePaidBy || "" : "",
    houseContributionNotes: linkedHouseId ? formValues.houseContributionNotes || "" : "",
    loanInterestAmount: linkedLoanId ? nullableNumber(formValues.loanInterestAmount) : null,
    loanPrincipalAmount: linkedLoanId ? nullableNumber(formValues.loanPrincipalAmount) : null,
    isLoanOverpayment: linkedLoanId ? Boolean(formValues.isLoanOverpayment) : false,
    loanOverpaymentAmount: linkedLoanId && formValues.isLoanOverpayment ? Number(formValues.loanOverpaymentAmount || 0) : 0,
    recurringItemId,
    isRecurring: shouldCreateRecurring,
    excludeFromBudget: formValues.type === "expense" ? Boolean(formValues.excludeFromBudget) : false,
    excludeFromTotal: Boolean(formValues.excludeFromTotal),
    excludeFromChart: Boolean(formValues.excludeFromChart),
    ruleExempt: Boolean(formValues.ruleExempt),
    isExample: false,
    receiptId: formValues.receiptId || null,
    receiptFileName: formValues.receiptFileName || null,
    receiptMimeType: formValues.receiptMimeType || null,
    receiptSizeBytes: Number(formValues.receiptSizeBytes || 0),
    receiptUploadedAt: formValues.receiptUploadedAt || null,
    createdAt: formValues.createdAt || existingTransaction?.createdAt || now,
    updatedAt: now
  };

  const transactions = existingId
    ? data.transactions.map(item => item.id === existingId ? transaction : item)
    : [transaction, ...data.transactions];

  let recurringItems = data.recurringItems || [];

  if (shouldCreateRecurring) {
    const recurringItem = {
      id: recurringItemId,
      name: transaction.title,
      type: transaction.type,
      amount: transaction.amount,
      amountType: formValues.recurringAmountType || "fixed",
      categoryId: transaction.categoryId,
      accountId: transaction.accountId,
      frequency: formValues.recurringFrequency || "monthly",
      nextDueDate: formValues.recurringNextDueDate || transaction.date,
      autoAdd: Boolean(formValues.recurringAutoAdd),
      reminderEnabled: formValues.recurringReminderEnabled !== false,
      isActive: true,
      isExample: false,
      createdAt: now,
      updatedAt: now
    };

    recurringItems = recurringItems.some(item => item.id === recurringItemId)
      ? recurringItems.map(item => item.id === recurringItemId ? { ...item, ...recurringItem, createdAt: item.createdAt || now } : item)
      : [recurringItem, ...recurringItems];
  }

  const withTransaction = { ...data, transactions, recurringItems };
  return syncHouseContributionForTransaction(syncLoanEventsForTransaction(withTransaction, transaction), transaction);
}

// Builds both legs of a manually-entered transfer at once, already linked to
// each other. After creation the two legs are edited independently, exactly
// like a CSV-imported pair — there is no ongoing two-way sync, only the
// unlink invariant (see unlinkTransferPair) that guarantees neither side is
// ever left pointing at a partner that no longer reciprocates.
function createTransferPair(data, formValues, now) {
  const amount = Number(formValues.amount || 0);
  const fromId = formValues.id || createId("txn");
  const toId = createId("txn");

  const shared = {
    date: formValues.date,
    amount,
    title: formValues.title || "Transfer",
    note: formValues.note || "",
    categoryId: null,
    linkedLoanId: null,
    linkedHouseId: null,
    linkedHouseContributionId: null,
    houseContributionType: null,
    housePersonId: null,
    housePersonName: "",
    houseContributionNotes: "",
    loanInterestAmount: null,
    loanPrincipalAmount: null,
    isLoanOverpayment: false,
    loanOverpaymentAmount: 0,
    recurringItemId: null,
    isRecurring: false,
    isExample: false,
    status: "manual",
    importSource: null,
    matchedBankRows: [],
    linkedAccountId: null,
    createdAt: now,
    updatedAt: now
  };

  const fromLeg = {
    ...shared,
    id: fromId,
    type: "expense",
    accountId: formValues.fromAccountId,
    excludeFromBudget: false,
    linkedSavingsGoalId: null,
    transferLinkId: toId,
    receiptId: formValues.receiptId || null,
    receiptFileName: formValues.receiptFileName || null,
    receiptMimeType: formValues.receiptMimeType || null,
    receiptSizeBytes: Number(formValues.receiptSizeBytes || 0),
    receiptUploadedAt: formValues.receiptUploadedAt || null
  };

  const toLeg = {
    ...shared,
    id: toId,
    type: "income",
    accountId: formValues.toAccountId,
    linkedSavingsGoalId: formValues.linkedSavingsGoalId || null,
    transferLinkId: fromId,
    receiptId: null,
    receiptFileName: null,
    receiptMimeType: null,
    receiptSizeBytes: 0,
    receiptUploadedAt: null
  };

  return {
    ...data,
    transactions: [fromLeg, toLeg, ...data.transactions]
  };
}

// Converts an existing income/expense transaction into a transfer. Reuses
// its id for whichever leg matches its original type (so nothing that
// references this id — a receipt, an import batch match — goes stale) and
// creates a brand new leg for the other account. Any loan or
// house-contribution link the original transaction had is removed first,
// since a transfer can't carry either; unlinkTransferPair runs defensively
// in case it was somehow already one half of a pair.
function convertExistingToTransfer(data, formValues, existingId, now) {
  const existingTransaction = data.transactions.find(item => item.id === existingId);
  const unlinked = unlinkTransferPair(data, existingId);
  const withoutOldLinks = removeHouseContributionForTransaction(removeLoanEventsForTransaction(unlinked, existingId), existingId);

  const amount = Number(formValues.amount || 0);
  const reuseAsExpenseLeg = existingTransaction?.type !== "income";
  const newLegId = createId("txn");
  const fromId = reuseAsExpenseLeg ? existingId : newLegId;
  const toId = reuseAsExpenseLeg ? newLegId : existingId;

  const shared = {
    date: formValues.date,
    amount,
    title: formValues.title || "Transfer",
    note: formValues.note || "",
    categoryId: null,
    linkedLoanId: null,
    linkedHouseId: null,
    linkedHouseContributionId: null,
    houseContributionType: null,
    housePersonId: null,
    housePersonName: "",
    houseContributionNotes: "",
    loanInterestAmount: null,
    loanPrincipalAmount: null,
    isLoanOverpayment: false,
    loanOverpaymentAmount: 0,
    recurringItemId: null,
    isRecurring: false,
    isExample: false,
    excludeFromTotal: false,
    excludeFromChart: false,
    status: existingTransaction?.status || "manual",
    importSource: existingTransaction?.importSource || null,
    matchedBankRows: existingTransaction?.matchedBankRows || [],
    linkedAccountId: null,
    createdAt: existingTransaction?.createdAt || now,
    updatedAt: now
  };

  const fromLeg = {
    ...shared,
    id: fromId,
    type: "expense",
    accountId: formValues.fromAccountId,
    excludeFromBudget: false,
    linkedSavingsGoalId: null,
    transferLinkId: toId,
    receiptId: reuseAsExpenseLeg ? (formValues.receiptId || null) : null,
    receiptFileName: reuseAsExpenseLeg ? (formValues.receiptFileName || null) : null,
    receiptMimeType: reuseAsExpenseLeg ? (formValues.receiptMimeType || null) : null,
    receiptSizeBytes: reuseAsExpenseLeg ? Number(formValues.receiptSizeBytes || 0) : 0,
    receiptUploadedAt: reuseAsExpenseLeg ? (formValues.receiptUploadedAt || null) : null
  };

  const toLeg = {
    ...shared,
    id: toId,
    type: "income",
    accountId: formValues.toAccountId,
    linkedSavingsGoalId: !reuseAsExpenseLeg ? (formValues.linkedSavingsGoalId || null) : null,
    transferLinkId: fromId,
    receiptId: !reuseAsExpenseLeg ? (formValues.receiptId || null) : null,
    receiptFileName: !reuseAsExpenseLeg ? (formValues.receiptFileName || null) : null,
    receiptMimeType: !reuseAsExpenseLeg ? (formValues.receiptMimeType || null) : null,
    receiptSizeBytes: !reuseAsExpenseLeg ? Number(formValues.receiptSizeBytes || 0) : 0,
    receiptUploadedAt: !reuseAsExpenseLeg ? (formValues.receiptUploadedAt || null) : null
  };

  return {
    ...withoutOldLinks,
    transactions: [fromLeg, toLeg, ...withoutOldLinks.transactions.filter(item => item.id !== existingId)]
  };
}

// A transaction "matches" a rule when its title contains the rule's saved
// text, case-insensitively. Shared by the rule sweep below, the Settings
// match-count preview, and the UI (title highlight, per-transaction
// "exclude from rules" note) so all three always agree on what counts as a
// match.
export function getMatchingExclusionRules(transaction, rules) {
  const title = (transaction?.title || "").trim().toLowerCase();
  if (!title) return [];
  return (rules || []).filter(rule => {
    const matchText = (rule.matchText || "").trim().toLowerCase();
    return matchText && title.includes(matchText);
  });
}

// Sweeps every saved exclusion rule against every transaction's title, so a
// rule created after the fact still catches transactions that were already
// sitting in the data ("back date" application), not just future ones. A
// rule only ever turns a flag ON (OR-merge with whatever is already set), so
// running it repeatedly can never silently undo a flag someone ticked by
// hand on an individual transaction. A transaction marked ruleExempt is
// skipped entirely, so a specific "R GUINNESS" payment that genuinely was
// real spending can opt out even though its title still matches.
// Also returns `changes`: the prior flag values for every transaction it
// touched, so a caller can offer an immediate "Undo last apply" without
// having to guess which transactions it's safe to revert.
export function applyExclusionRules(data) {
  const rules = (data.exclusionRules || []).filter(rule => (rule.matchText || "").trim());
  if (!rules.length) return { data, updatedCount: 0, changes: [] };

  const changes = [];
  const now = new Date().toISOString();

  const transactions = data.transactions.map(transaction => {
    if (transaction.ruleExempt) return transaction;
    const matchingRules = getMatchingExclusionRules(transaction, rules);
    if (!matchingRules.length) return transaction;

    const nextExcludeFromBudget = Boolean(transaction.excludeFromBudget) || matchingRules.some(rule => rule.excludeFromBudget);
    const nextExcludeFromTotal = Boolean(transaction.excludeFromTotal) || matchingRules.some(rule => rule.excludeFromTotal);
    const nextExcludeFromChart = Boolean(transaction.excludeFromChart) || matchingRules.some(rule => rule.excludeFromChart);

    const changed = nextExcludeFromBudget !== Boolean(transaction.excludeFromBudget)
      || nextExcludeFromTotal !== Boolean(transaction.excludeFromTotal)
      || nextExcludeFromChart !== Boolean(transaction.excludeFromChart);
    if (!changed) return transaction;

    changes.push({
      id: transaction.id,
      previous: {
        excludeFromBudget: Boolean(transaction.excludeFromBudget),
        excludeFromTotal: Boolean(transaction.excludeFromTotal),
        excludeFromChart: Boolean(transaction.excludeFromChart)
      }
    });
    return {
      ...transaction,
      excludeFromBudget: nextExcludeFromBudget,
      excludeFromTotal: nextExcludeFromTotal,
      excludeFromChart: nextExcludeFromChart,
      updatedAt: now
    };
  });

  return { data: { ...data, transactions }, updatedCount: changes.length, changes };
}

// Reverts exactly the transactions/flags a prior applyExclusionRules call
// changed, using the `changes` list it returned. Anything the user has
// since edited by hand is left alone — this only restores the three
// exclusion flags, and only on the ids present in `changes`.
export function undoExclusionRuleChanges(data, changes) {
  if (!changes || !changes.length) return data;
  const now = new Date().toISOString();
  const previousById = new Map(changes.map(change => [change.id, change.previous]));

  return {
    ...data,
    transactions: data.transactions.map(transaction => {
      const previous = previousById.get(transaction.id);
      if (!previous) return transaction;
      return { ...transaction, ...previous, updatedAt: now };
    })
  };
}

export function deleteTransaction(data, transactionId) {
  const unlinked = unlinkTransferPair(data, transactionId);
  return removeHouseContributionForTransaction(removeLoanEventsForTransaction({
    ...unlinked,
    transactions: unlinked.transactions.filter(transaction => transaction.id !== transactionId)
  }, transactionId), transactionId);
}

// A transferLinkId only ever means something as a reciprocal pair: A points at
// B and B points at A. Any operation that breaks that pairing (deleting one
// side, marking it "not a transfer", editing it enough to invalidate the
// match) must go through here so the other side is never left pointing at a
// transaction that no longer reciprocates.
export function unlinkTransferPair(data, transactionId) {
  const transaction = data.transactions.find(item => item.id === transactionId);
  const partnerId = transaction?.transferLinkId;
  if (!partnerId) return data;

  const idsToClear = new Set([transactionId, partnerId]);

  return {
    ...data,
    transactions: data.transactions.map(item => {
      if (!idsToClear.has(item.id) || !item.transferLinkId) return item;
      return { ...item, transferLinkId: null };
    })
  };
}

// Links two already-existing transactions as a transfer pair instead of
// creating a fresh leg — for the case where both sides were already entered
// separately (manually, or from two CSVs imported apart) and never got
// auto-matched. Defensively unlinks each from any prior partner first, so
// neither side is ever left half-pointing at two different transactions.
// Deliberately leaves every other field untouched (category, note, etc.) —
// same as the CSV importer's own match-existing path — since both rows
// already represent real, independently-correct transactions.
export function linkTransferPair(data, transactionIdA, transactionIdB) {
  if (!transactionIdA || !transactionIdB || transactionIdA === transactionIdB) return data;
  const hasBoth = data.transactions.some(item => item.id === transactionIdA)
    && data.transactions.some(item => item.id === transactionIdB);
  if (!hasBoth) return data;

  const now = new Date().toISOString();
  const unlinked = unlinkTransferPair(unlinkTransferPair(data, transactionIdA), transactionIdB);

  return {
    ...unlinked,
    transactions: unlinked.transactions.map(item => {
      if (item.id === transactionIdA) return { ...item, transferLinkId: transactionIdB, linkedAccountId: null, updatedAt: now };
      if (item.id === transactionIdB) return { ...item, transferLinkId: transactionIdA, linkedAccountId: null, updatedAt: now };
      return item;
    })
  };
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
