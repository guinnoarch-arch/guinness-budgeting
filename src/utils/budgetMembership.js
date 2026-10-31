import { getMonthKey } from "./dates.js";

// A transaction normally counts toward a budget automatically: same category,
// one of the budget's accounts, and inside the budget's period. Picking
// transactions by hand on the Transactions page (Budgets > "Add transactions")
// pins them with transaction.budgetId instead:
//   budgetId = "<budget id>"  counts toward that budget only
//   budgetId = NO_BUDGET_ID   taken out of every budget it would match
//   budgetId unset            automatic
// A pin to a budget that no longer exists (or is archived) is ignored.
export const NO_BUDGET_ID = "none";

// The calendar months a yearly budget adds up: the selected month and the 11
// before it, oldest first.
export function getTrailingMonthKeys(monthKey, count = 12) {
  const [year, month] = String(monthKey).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => (
    getMonthKey(new Date(year, month - 1 - (count - 1 - index), 1))
  ));
}

// A monthly budget belongs to the month it was set for. A yearly budget is
// shown in the month it was created and every month after it.
export function isBudgetActiveInMonth(budget, monthKey) {
  if (budget?.isYearly) return String(budget.month || "") <= monthKey;
  return budget?.month === monthKey;
}

export function getBudgetPeriodMonthKeys(budget, monthKey) {
  return budget?.isYearly ? getTrailingMonthKeys(monthKey, 12) : [monthKey];
}

// Whether two budget rows would both be live in at least one month. Two live
// budgets for the same category and account would count the same spending twice.
export function budgetsOverlapInTime(a, b) {
  const aMonth = String(a?.month || "");
  const bMonth = String(b?.month || "");
  if (a?.isYearly && b?.isYearly) return true;
  if (a?.isYearly) return bMonth >= aMonth;
  if (b?.isYearly) return aMonth >= bMonth;
  return aMonth === bMonth;
}
