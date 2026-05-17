import { createId } from "../utils/ids.js";

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateString, months) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function getNextDueDate(dateString, frequency) {
  switch (frequency) {
    case "weekly":
      return addDays(dateString, 7);
    case "fortnightly":
      return addDays(dateString, 14);
    case "every_4_weeks":
      return addDays(dateString, 28);
    case "yearly":
      return addMonths(dateString, 12);
    case "monthly":
    default:
      return addMonths(dateString, 1);
  }
}

export function processRecurringItems(data) {
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;
  const newTransactions = [...data.transactions];
  const recurringItems = data.recurringItems.map(item => {
    if (!item.isActive || !item.autoAdd || item.amountType !== "fixed") return item;
    if (item.nextDueDate > today) return item;

    const alreadyExists = newTransactions.some(txn =>
      txn.recurringItemId === item.id && txn.date === item.nextDueDate
    );

    if (!alreadyExists) {
      newTransactions.push({
        id: createId("txn"),
        type: item.type || "expense",
        date: item.nextDueDate,
        amount: Number(item.amount),
        title: item.name,
        note: "Auto-added fixed recurring payment",
        categoryId: item.categoryId,
        accountId: item.accountId,
        fromAccountId: null,
        toAccountId: null,
        linkedSavingsGoalId: null,
        recurringItemId: item.id,
        isRecurring: true,
        isExample: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      changed = true;
    }

    return {
      ...item,
      nextDueDate: getNextDueDate(item.nextDueDate, item.frequency),
      updatedAt: new Date().toISOString()
    };
  });

  return changed ? { changed, data: { ...data, transactions: newTransactions, recurringItems } } : { changed: false, data };
}
