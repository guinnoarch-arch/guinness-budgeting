import { createId } from "../utils/ids.js";
import { removeHouseContributionForTransaction, syncHouseContributionForTransaction } from "../utils/houseTracking.js";
import { removeLoanEventsForTransaction, syncLoanEventsForTransaction } from "../utils/loanLinking.js";

export function upsertTransaction(data, formValues, existingId = null) {
  const now = new Date().toISOString();

  // "Transfer" is a creation-time shortcut, not a stored shape: it always
  // produces two independent, already-linked income/expense transactions
  // rather than one record spanning two accounts. It only ever applies to
  // creating something new — editing an existing (already income/expense)
  // transaction never routes through here.
  if (formValues.type === "transfer" && !existingId) {
    return createTransferPair(data, formValues, now);
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

function nullableNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
