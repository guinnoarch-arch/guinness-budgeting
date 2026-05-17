import { createId } from "../utils/ids.js";

export function upsertTransaction(data, formValues, existingId = null) {
  const now = new Date().toISOString();
  const shouldCreateRecurring = Boolean(formValues.isRecurring) && formValues.type !== "transfer";
  const recurringItemId = formValues.recurringItemId || (shouldCreateRecurring ? createId("rec") : null);

  const transaction = {
    id: existingId || createId("txn"),
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
    recurringItemId,
    isRecurring: shouldCreateRecurring,
    isExample: false,
    createdAt: formValues.createdAt || now,
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

  return { ...data, transactions, recurringItems };
}

export function deleteTransaction(data, transactionId) {
  return {
    ...data,
    transactions: data.transactions.filter(transaction => transaction.id !== transactionId)
  };
}
