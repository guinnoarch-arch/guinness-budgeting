import { createId } from "../utils/ids.js";
import { addDaysToIsoDate, addMonthsToIsoDate, todayIsoDate } from "../utils/dates.js";

const MAX_RECURRING_CATCH_UP_ITEMS = 60;

function getNextDueDate(dateString, frequency) {
  switch (frequency) {
    case "weekly":
      return addDaysToIsoDate(dateString, 7);
    case "fortnightly":
      return addDaysToIsoDate(dateString, 14);
    case "every_4_weeks":
      return addDaysToIsoDate(dateString, 28);
    case "yearly":
      return addMonthsToIsoDate(dateString, 12);
    case "monthly":
    default:
      return addMonthsToIsoDate(dateString, 1);
  }
}

function buildRecurringTransaction(item, dueDate, now) {
  return {
    id: createId("txn"),
    type: item.type || "expense",
    date: dueDate,
    amount: Number(item.amount || 0),
    title: item.name || "Recurring payment",
    note: "Auto-added fixed recurring payment",
    categoryId: item.categoryId || null,
    accountId: item.accountId || null,
    linkedSavingsGoalId: null,
    linkedLoanId: null,
    loanInterestAmount: null,
    loanPrincipalAmount: null,
    isLoanOverpayment: false,
    loanOverpaymentAmount: 0,
    recurringItemId: item.id,
    isRecurring: true,
    excludeFromBudget: false,
    isExample: false,
    createdAt: now,
    updatedAt: now
  };
}

export function processRecurringItems(data) {
  const today = todayIsoDate();
  const now = new Date().toISOString();
  let changed = false;
  const newTransactions = [...(data.transactions || [])];

  const recurringItems = (data.recurringItems || []).map(item => {
    if (item.isActive === false || !item.autoAdd || item.amountType !== "fixed" || !item.nextDueDate) return item;

    let nextDueDate = item.nextDueDate;
    let generatedCount = 0;
    let itemChanged = false;

    while (nextDueDate <= today && generatedCount < MAX_RECURRING_CATCH_UP_ITEMS) {
      const alreadyExists = newTransactions.some(txn =>
        txn.recurringItemId === item.id && txn.date === nextDueDate
      );

      if (!alreadyExists) {
        newTransactions.push(buildRecurringTransaction(item, nextDueDate, now));
        generatedCount += 1;
      }

      nextDueDate = getNextDueDate(nextDueDate, item.frequency);
      itemChanged = true;
    }

    if (!itemChanged) return item;

    changed = true;
    return {
      ...item,
      nextDueDate,
      updatedAt: now,
      recurrenceCatchUpLimited: generatedCount >= MAX_RECURRING_CATCH_UP_ITEMS
    };
  });

  return changed ? { changed, data: { ...data, transactions: newTransactions, recurringItems } } : { changed: false, data };
}
