import { createId } from "../utils/ids.js";
import { removeHouseContributionForTransaction, syncHouseContributionForTransaction } from "../utils/houseTracking.js";
import { removeLoanEventsForTransaction, syncLoanEventsForTransaction } from "../utils/loanLinking.js";

export function upsertTransaction(data, formValues, existingId = null) {
  const now = new Date().toISOString();
  const shouldCreateRecurring = Boolean(formValues.isRecurring) && formValues.type !== "transfer";
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
    categoryId: formValues.type === "transfer" ? null : formValues.categoryId,
    accountId: formValues.type === "transfer" ? null : formValues.accountId,
    fromAccountId: formValues.type === "transfer" ? formValues.fromAccountId : null,
    toAccountId: formValues.type === "transfer" ? formValues.toAccountId : null,
    linkedSavingsGoalId: formValues.type === "transfer" ? formValues.linkedSavingsGoalId || null : null,
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

export function deleteTransaction(data, transactionId) {
  return removeHouseContributionForTransaction(removeLoanEventsForTransaction({
    ...data,
    transactions: data.transactions.filter(transaction => transaction.id !== transactionId)
  }, transactionId), transactionId);
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
