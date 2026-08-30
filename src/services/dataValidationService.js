import { normaliseAppData } from "./storageService.js";
import { createId } from "../utils/ids.js";

const VALID_TRANSACTION_TYPES = new Set(["income", "expense", "transfer"]);
const VALID_LOAN_TYPES = new Set(["studentLoan", "mortgage", "personalLoan", "otherLoan"]);

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isValidDateString(value) {
  if (!value || typeof value !== "string") return false;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) && !Number.isNaN(date.getTime());
}

function todayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  const number = Number(value || 0);
  return `£${number.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function createIssue(severity, code, title, detail, options = {}) {
  return {
    id: `${code}_${options.affectedType || "app"}_${options.affectedId || "general"}_${options.index ?? ""}`,
    severity,
    code,
    title,
    detail,
    affectedType: options.affectedType || "appData",
    affectedId: options.affectedId || null,
    repairable: Boolean(options.repairable),
    repairDescription: options.repairDescription || null
  };
}

function collectDuplicateIds(items, fieldName) {
  const seen = new Set();
  const duplicates = new Set();
  (items || []).forEach(item => {
    const id = item?.id;
    if (!id) return;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates].map(id => createIssue(
    "error",
    "duplicate_id",
    `Duplicate ID in ${fieldName}`,
    `${fieldName} contains the duplicate ID ${id}. This needs manual checking because other records may link to it.`,
    { affectedType: fieldName, affectedId: id }
  ));
}

export function validateCurrentAppData(rawData) {
  const data = normaliseAppData(rawData);
  const issues = [];
  const now = new Date().toISOString();

  const accountIds = new Set(data.accounts.map(account => account.id).filter(Boolean));
  const activeAccountIds = new Set(data.accounts.filter(account => account.isActive !== false).map(account => account.id).filter(Boolean));
  const categoryIds = new Set(data.categories.map(category => category.id).filter(Boolean));
  const activeCategoryIds = new Set(data.categories.filter(category => category.isActive !== false).map(category => category.id).filter(Boolean));
  const budgetIds = new Set(data.budgets.map(budget => budget.id).filter(Boolean));
  const recurringIds = new Set(data.recurringItems.map(item => item.id).filter(Boolean));
  const transactionIds = new Set(data.transactions.map(transaction => transaction.id).filter(Boolean));
  const loanIds = new Set((data.loans || []).map(loan => loan.id).filter(Boolean));
  const savingsGoalIds = new Set((data.savingsGoals || []).map(goal => goal.id).filter(Boolean));

  [
    ["transactions", data.transactions],
    ["accounts", data.accounts],
    ["categories", data.categories],
    ["budgets", data.budgets],
    ["recurringItems", data.recurringItems],
    ["savingsGoals", data.savingsGoals],
    ["loans", data.loans || []],
    ["loanEvents", data.loanEvents || []]
  ].forEach(([field, records]) => {
    issues.push(...collectDuplicateIds(records, field));
    (records || []).forEach((record, index) => {
      if (!record?.id) {
        issues.push(createIssue(
          "warning",
          "missing_id",
          `Missing ID in ${field}`,
          `${field} record ${index + 1} has no ID. The safe repair will assign one.`,
          { affectedType: field, index, repairable: true, repairDescription: "Assign a new ID." }
        ));
      }
    });
  });

  data.accounts.forEach(account => {
    if (!account.name || !String(account.name).trim()) {
      issues.push(createIssue("warning", "account_missing_name", "Account missing name", "An account has no readable name.", {
        affectedType: "accounts",
        affectedId: account.id,
        repairable: true,
        repairDescription: "Rename it to Account."
      }));
    }

    if (!Number.isFinite(Number(account.openingBalance))) {
      issues.push(createIssue("warning", "account_bad_opening_balance", "Account opening balance is unreadable", `${account.name || account.id} has an invalid opening balance.`, {
        affectedType: "accounts",
        affectedId: account.id,
        repairable: true,
        repairDescription: "Set opening balance to 0."
      }));
    }
  });

  data.categories.forEach(category => {
    if (!category.name || !String(category.name).trim()) {
      issues.push(createIssue("warning", "category_missing_name", "Category missing name", "A category has no readable name.", {
        affectedType: "categories",
        affectedId: category.id,
        repairable: true,
        repairDescription: "Rename it to Category."
      }));
    }
    if (!category.type || !["income", "expense"].includes(category.type)) {
      issues.push(createIssue("warning", "category_bad_type", "Category has bad type", `${category.name || category.id} is not marked as income or expense.`, {
        affectedType: "categories",
        affectedId: category.id,
        repairable: true,
        repairDescription: "Set category type to expense."
      }));
    }
  });

  data.transactions.forEach(transaction => {
    const type = transaction.type || "expense";

    if (!VALID_TRANSACTION_TYPES.has(type)) {
      issues.push(createIssue("warning", "transaction_bad_type", "Transaction type is invalid", `${transaction.title || transaction.id || "A transaction"} has type ${transaction.type || "blank"}.`, {
        affectedType: "transactions",
        affectedId: transaction.id,
        repairable: true,
        repairDescription: "Set type to expense."
      }));
    }

    if (!isValidDateString(transaction.date)) {
      issues.push(createIssue("warning", "transaction_bad_date", "Transaction date is invalid", `${transaction.title || transaction.id || "A transaction"} has an invalid date.`, {
        affectedType: "transactions",
        affectedId: transaction.id,
        repairable: true,
        repairDescription: "Set date to today."
      }));
    }

    if (!Number.isFinite(Number(transaction.amount))) {
      issues.push(createIssue("warning", "transaction_bad_amount", "Transaction amount is invalid", `${transaction.title || transaction.id || "A transaction"} has an unreadable amount.`, {
        affectedType: "transactions",
        affectedId: transaction.id,
        repairable: true,
        repairDescription: "Set amount to 0."
      }));
    } else if (Number(transaction.amount) < 0) {
      issues.push(createIssue("warning", "transaction_negative_amount", "Transaction amount is negative", `${transaction.title || transaction.id || "A transaction"} is stored as ${money(transaction.amount)}. Amounts should be positive and type controls direction.`, {
        affectedType: "transactions",
        affectedId: transaction.id,
        repairable: true,
        repairDescription: "Convert amount to positive."
      }));
    }

    if (type === "transfer") {
      if (!transaction.fromAccountId || !accountIds.has(transaction.fromAccountId)) {
        issues.push(createIssue("error", "transfer_missing_from_account", "Transfer missing source account", `${transaction.title || transaction.id || "A transfer"} has no valid from account.`, {
          affectedType: "transactions",
          affectedId: transaction.id
        }));
      }
      if (!transaction.toAccountId || !accountIds.has(transaction.toAccountId)) {
        issues.push(createIssue("error", "transfer_missing_to_account", "Transfer missing destination account", `${transaction.title || transaction.id || "A transfer"} has no valid to account.`, {
          affectedType: "transactions",
          affectedId: transaction.id
        }));
      }
      if (transaction.fromAccountId && transaction.toAccountId && transaction.fromAccountId === transaction.toAccountId) {
        issues.push(createIssue("error", "transfer_same_account", "Transfer uses the same account twice", `${transaction.title || transaction.id || "A transfer"} transfers from and to the same account.`, {
          affectedType: "transactions",
          affectedId: transaction.id
        }));
      }
      if (transaction.linkedSavingsGoalId && !savingsGoalIds.has(transaction.linkedSavingsGoalId)) {
        issues.push(createIssue("warning", "transfer_missing_goal", "Transfer linked to missing savings goal", `${transaction.title || transaction.id || "A transfer"} links to a savings goal that no longer exists.`, {
          affectedType: "transactions",
          affectedId: transaction.id,
          repairable: true,
          repairDescription: "Clear the missing savings goal link."
        }));
      }
    } else {
      if (!transaction.accountId || !accountIds.has(transaction.accountId)) {
        issues.push(createIssue("error", "transaction_missing_account", "Transaction missing account", `${transaction.title || transaction.id || "A transaction"} has no valid account.`, {
          affectedType: "transactions",
          affectedId: transaction.id,
          repairable: activeAccountIds.size > 0,
          repairDescription: activeAccountIds.size > 0 ? "Move it to the first active account." : null
        }));
      }
      if (transaction.categoryId && !categoryIds.has(transaction.categoryId)) {
        issues.push(createIssue("warning", "transaction_missing_category", "Transaction linked to missing category", `${transaction.title || transaction.id || "A transaction"} links to a category that no longer exists.`, {
          affectedType: "transactions",
          affectedId: transaction.id,
          repairable: true,
          repairDescription: "Move it to an Other category if available, otherwise clear the category."
        }));
      }
      if (transaction.linkedLoanId && !loanIds.has(transaction.linkedLoanId)) {
        issues.push(createIssue("warning", "transaction_missing_loan", "Transaction linked to missing loan", `${transaction.title || transaction.id || "A transaction"} links to a loan that no longer exists.`, {
          affectedType: "transactions",
          affectedId: transaction.id,
          repairable: true,
          repairDescription: "Clear the missing loan link and loan split fields."
        }));
      }
    }

    if (transaction.recurringItemId && !recurringIds.has(transaction.recurringItemId)) {
      issues.push(createIssue("warning", "transaction_missing_recurring_item", "Transaction linked to missing recurring item", `${transaction.title || transaction.id || "A transaction"} links to a recurring item that no longer exists.`, {
        affectedType: "transactions",
        affectedId: transaction.id,
        repairable: true,
        repairDescription: "Clear the missing recurring item link."
      }));
    }
  });

  data.budgets.forEach(budget => {
    if (budget.categoryId && !categoryIds.has(budget.categoryId)) {
      issues.push(createIssue("warning", "budget_missing_category", "Budget linked to missing category", `Budget ${budget.id || "without ID"} links to a category that no longer exists.`, {
        affectedType: "budgets",
        affectedId: budget.id,
        repairable: true,
        repairDescription: "Disable the budget so it stops affecting calculations."
      }));
    }
    if (budget.accountId && !accountIds.has(budget.accountId)) {
      issues.push(createIssue("warning", "budget_missing_account", "Budget linked to missing account", `Budget ${budget.id || "without ID"} links to an account that no longer exists.`, {
        affectedType: "budgets",
        affectedId: budget.id,
        repairable: true,
        repairDescription: "Clear the missing account link."
      }));
    }
    if (Array.isArray(budget.accountIds) && budget.accountIds.some(id => id && !accountIds.has(id))) {
      issues.push(createIssue("warning", "budget_missing_account", "Budget linked to missing account", `Budget ${budget.id || "without ID"} links to one or more accounts that no longer exist.`, {
        affectedType: "budgets",
        affectedId: budget.id,
        repairable: true,
        repairDescription: "Remove the missing account(s) from this budget's account selection."
      }));
    }
    if (!Number.isFinite(Number(budget.limit))) {
      issues.push(createIssue("warning", "budget_bad_limit", "Budget limit is invalid", `Budget ${budget.id || "without ID"} has an unreadable limit.`, {
        affectedType: "budgets",
        affectedId: budget.id,
        repairable: true,
        repairDescription: "Set the budget limit to 0."
      }));
    }
  });

  data.recurringItems.forEach(item => {
    if (!isValidDateString(item.nextDueDate)) {
      issues.push(createIssue("warning", "recurring_bad_due_date", "Recurring item has invalid next due date", `${item.name || item.id || "A recurring item"} has an invalid next due date.`, {
        affectedType: "recurringItems",
        affectedId: item.id,
        repairable: true,
        repairDescription: "Set next due date to today."
      }));
    }
    if (item.categoryId && !categoryIds.has(item.categoryId)) {
      issues.push(createIssue("warning", "recurring_missing_category", "Recurring item linked to missing category", `${item.name || item.id || "A recurring item"} links to a category that no longer exists.`, {
        affectedType: "recurringItems",
        affectedId: item.id,
        repairable: true,
        repairDescription: "Clear the missing category link."
      }));
    }
    if (item.accountId && !accountIds.has(item.accountId)) {
      issues.push(createIssue("warning", "recurring_missing_account", "Recurring item linked to missing account", `${item.name || item.id || "A recurring item"} links to an account that no longer exists.`, {
        affectedType: "recurringItems",
        affectedId: item.id,
        repairable: true,
        repairDescription: "Disable the recurring item."
      }));
    }
  });

  (data.loans || []).forEach(loan => {
    if (!VALID_LOAN_TYPES.has(loan.type)) {
      issues.push(createIssue("warning", "loan_bad_type", "Loan type is invalid", `${loan.name || loan.id || "A loan"} has an invalid type.`, {
        affectedType: "loans",
        affectedId: loan.id,
        repairable: true,
        repairDescription: "Set loan type to otherLoan."
      }));
    }
    if (!Number.isFinite(Number(loan.currentBalance))) {
      issues.push(createIssue("warning", "loan_bad_balance", "Loan balance is invalid", `${loan.name || loan.id || "A loan"} has an unreadable current balance.`, {
        affectedType: "loans",
        affectedId: loan.id,
        repairable: true,
        repairDescription: "Set current balance to 0."
      }));
    }
    if (loan.type === "mortgage" && !isObject(loan.mortgageDetails)) {
      issues.push(createIssue("error", "mortgage_missing_details", "Mortgage details missing", `${loan.name || loan.id || "A mortgage"} is marked as a mortgage but has no mortgage details object.`, {
        affectedType: "loans",
        affectedId: loan.id,
        repairable: true,
        repairDescription: "Create a blank mortgage details object."
      }));
    }
    if (loan.type === "studentLoan" && !isObject(loan.studentLoanDetails)) {
      issues.push(createIssue("warning", "student_loan_missing_details", "Student loan details missing", `${loan.name || loan.id || "A student loan"} has no student loan details object.`, {
        affectedType: "loans",
        affectedId: loan.id,
        repairable: true,
        repairDescription: "Create a blank student loan details object."
      }));
    }
  });

  (data.loanEvents || []).forEach(event => {
    if (event.loanId && !loanIds.has(event.loanId)) {
      issues.push(createIssue("warning", "loan_event_missing_loan", "Loan event linked to missing loan", `Loan event ${event.id || "without ID"} links to a loan that no longer exists.`, {
        affectedType: "loanEvents",
        affectedId: event.id,
        repairable: true,
        repairDescription: "Remove the orphaned loan event."
      }));
    }
    if (event.transactionId && !transactionIds.has(event.transactionId)) {
      issues.push(createIssue("warning", "loan_event_missing_transaction", "Loan event linked to missing transaction", `Loan event ${event.id || "without ID"} links to a transaction that no longer exists.`, {
        affectedType: "loanEvents",
        affectedId: event.id,
        repairable: true,
        repairDescription: "Remove the orphaned loan event."
      }));
    }
  });

  const errorCount = issues.filter(issue => issue.severity === "error").length;
  const warningCount = issues.filter(issue => issue.severity === "warning").length;
  const repairableCount = issues.filter(issue => issue.repairable).length;

  return {
    ok: errorCount === 0 && warningCount === 0,
    createdAt: now,
    summary: {
      errorCount,
      warningCount,
      infoCount: issues.filter(issue => issue.severity === "info").length,
      repairableCount,
      totalIssues: issues.length
    },
    issues
  };
}

function repairRecordId(record, prefix) {
  if (record?.id) return record;
  return { ...record, id: createId(prefix) };
}

function findFallbackCategoryId(data, type = "expense") {
  const candidates = data.categories.filter(category => category.type === type && category.isActive !== false);
  return candidates.find(category => String(category.name || "").toLowerCase() === "other")?.id
    || candidates.find(category => String(category.name || "").toLowerCase().includes("other"))?.id
    || candidates[0]?.id
    || null;
}

function findFallbackAccountId(data) {
  return data.accounts.find(account => account.isActive !== false && account.type === "current")?.id
    || data.accounts.find(account => account.isActive !== false)?.id
    || null;
}

export function repairSafeAppDataIssues(rawData, validationReport = null) {
  const data = normaliseAppData(rawData);
  const report = validationReport || validateCurrentAppData(data);
  const now = new Date().toISOString();
  const repairs = [];
  const accountIds = new Set(data.accounts.map(account => account.id).filter(Boolean));
  const categoryIds = new Set(data.categories.map(category => category.id).filter(Boolean));
  const recurringIds = new Set(data.recurringItems.map(item => item.id).filter(Boolean));
  const loanIds = new Set((data.loans || []).map(loan => loan.id).filter(Boolean));
  const transactionIds = new Set(data.transactions.map(transaction => transaction.id).filter(Boolean));
  const savingsGoalIds = new Set((data.savingsGoals || []).map(goal => goal.id).filter(Boolean));
  const fallbackAccountId = findFallbackAccountId(data);

  const next = {
    ...data,
    accounts: data.accounts.map((account, index) => {
      let item = repairRecordId(account, "acc");
      if (!account.id) repairs.push(`Assigned ID to account ${index + 1}.`);
      if (!item.name || !String(item.name).trim()) {
        item = { ...item, name: "Account" };
        repairs.push(`Renamed blank account ${item.id}.`);
      }
      if (!Number.isFinite(Number(item.openingBalance))) {
        item = { ...item, openingBalance: 0 };
        repairs.push(`Set invalid opening balance to 0 for ${item.name}.`);
      }
      return item;
    }),
    categories: data.categories.map((category, index) => {
      let item = repairRecordId(category, "cat");
      if (!category.id) repairs.push(`Assigned ID to category ${index + 1}.`);
      if (!item.name || !String(item.name).trim()) {
        item = { ...item, name: "Category" };
        repairs.push(`Renamed blank category ${item.id}.`);
      }
      if (!item.type || !["income", "expense"].includes(item.type)) {
        item = { ...item, type: "expense" };
        repairs.push(`Set invalid category type to expense for ${item.name}.`);
      }
      return item;
    })
  };

  const nextAccountIds = new Set(next.accounts.map(account => account.id).filter(Boolean));
  const nextCategoryIds = new Set(next.categories.map(category => category.id).filter(Boolean));

  next.transactions = data.transactions.map((transaction, index) => {
    let item = repairRecordId(transaction, "txn");
    if (!transaction.id) repairs.push(`Assigned ID to transaction ${index + 1}.`);
    const type = VALID_TRANSACTION_TYPES.has(item.type) ? item.type : "expense";
    if (type !== item.type) repairs.push(`Set invalid transaction type to expense for ${item.title || item.id}.`);

    item = {
      ...item,
      type,
      title: item.title || "Untitled transaction",
      amount: Math.abs(asNumber(item.amount, 0)),
      date: isValidDateString(item.date) ? item.date.slice(0, 10) : todayString()
    };

    if (!Number.isFinite(Number(transaction.amount))) repairs.push(`Set invalid amount to 0 for ${item.title}.`);
    if (Number(transaction.amount) < 0) repairs.push(`Converted negative amount to positive for ${item.title}.`);
    if (!isValidDateString(transaction.date)) repairs.push(`Set invalid date to today for ${item.title}.`);

    if (type === "transfer") {
      if (item.linkedSavingsGoalId && !savingsGoalIds.has(item.linkedSavingsGoalId)) {
        item = { ...item, linkedSavingsGoalId: null };
        repairs.push(`Cleared missing savings goal link for transfer ${item.title}.`);
      }
    } else {
      if ((!item.accountId || !nextAccountIds.has(item.accountId)) && fallbackAccountId) {
        item = { ...item, accountId: fallbackAccountId };
        repairs.push(`Moved ${item.title} to fallback account.`);
      }
      if (item.categoryId && !nextCategoryIds.has(item.categoryId)) {
        const fallbackCategoryId = findFallbackCategoryId(next, type === "income" ? "income" : "expense");
        item = { ...item, categoryId: fallbackCategoryId };
        repairs.push(`Moved ${item.title} to fallback category.`);
      }
      if (item.linkedLoanId && !loanIds.has(item.linkedLoanId)) {
        item = {
          ...item,
          linkedLoanId: null,
          loanInterestAmount: null,
          loanPrincipalAmount: null,
          isLoanOverpayment: false,
          loanOverpaymentAmount: 0
        };
        repairs.push(`Cleared missing loan link for ${item.title}.`);
      }
    }

    if (item.recurringItemId && !recurringIds.has(item.recurringItemId)) {
      item = { ...item, recurringItemId: null, isRecurring: false };
      repairs.push(`Cleared missing recurring link for ${item.title}.`);
    }

    return item;
  });

  next.budgets = data.budgets.map((budget, index) => {
    let item = repairRecordId(budget, "bud");
    if (!budget.id) repairs.push(`Assigned ID to budget ${index + 1}.`);
    if (item.categoryId && !nextCategoryIds.has(item.categoryId)) {
      item = { ...item, isEnabled: false };
      repairs.push(`Disabled budget with missing category ${item.id}.`);
    }
    if (item.accountId && !nextAccountIds.has(item.accountId)) {
      item = { ...item, accountId: null };
      repairs.push(`Cleared missing account link on budget ${item.id}.`);
    }
    if (!Number.isFinite(Number(item.limit))) {
      item = { ...item, limit: 0 };
      repairs.push(`Set invalid budget limit to 0 for ${item.id}.`);
    }
    return item;
  });

  next.recurringItems = data.recurringItems.map((recurring, index) => {
    let item = repairRecordId(recurring, "rec");
    if (!recurring.id) repairs.push(`Assigned ID to recurring item ${index + 1}.`);
    item = {
      ...item,
      name: item.name || "Recurring item",
      amount: Math.abs(asNumber(item.amount, 0)),
      nextDueDate: isValidDateString(item.nextDueDate) ? item.nextDueDate.slice(0, 10) : todayString()
    };
    if (!isValidDateString(recurring.nextDueDate)) repairs.push(`Set invalid recurring due date to today for ${item.name}.`);
    if (item.categoryId && !nextCategoryIds.has(item.categoryId)) {
      item = { ...item, categoryId: null };
      repairs.push(`Cleared missing category from recurring item ${item.name}.`);
    }
    if (item.accountId && !nextAccountIds.has(item.accountId)) {
      item = { ...item, isActive: false };
      repairs.push(`Disabled recurring item ${item.name} because its account is missing.`);
    }
    return item;
  });

  next.savingsGoals = data.savingsGoals.map((goal, index) => {
    let item = repairRecordId(goal, "goal");
    if (!goal.id) repairs.push(`Assigned ID to savings goal ${index + 1}.`);
    return {
      ...item,
      name: item.name || "Savings goal",
      targetAmount: Math.abs(asNumber(item.targetAmount, 0)),
      currentManualAmount: Math.abs(asNumber(item.currentManualAmount, 0))
    };
  });

  next.loans = (data.loans || []).map((loan, index) => {
    let item = repairRecordId(loan, "loan");
    if (!loan.id) repairs.push(`Assigned ID to loan ${index + 1}.`);
    const type = VALID_LOAN_TYPES.has(item.type) ? item.type : "otherLoan";
    if (type !== item.type) repairs.push(`Set invalid loan type to otherLoan for ${item.name || item.id}.`);
    item = {
      ...item,
      type,
      name: item.name || "Loan",
      originalAmount: Math.abs(asNumber(item.originalAmount, 0)),
      currentBalance: Math.abs(asNumber(item.currentBalance, 0)),
      balanceDate: isValidDateString(item.balanceDate) ? item.balanceDate.slice(0, 10) : todayString(),
      startDate: isValidDateString(item.startDate) ? item.startDate.slice(0, 10) : todayString()
    };
    if (type === "mortgage" && !isObject(item.mortgageDetails)) {
      item = {
        ...item,
        mortgageDetails: {
          repaymentType: "repayment",
          termYears: 25,
          remainingTermMonths: 300,
          monthlyPayment: 0,
          paymentDay: 1,
          interestType: "fixed",
          currentRate: 0,
          fixedUntil: "",
          followOnRate: 0,
          plannedMonthlyOverpayment: 0,
          overpaymentAllowancePercent: 10,
          earlyRepaymentChargeApplies: false,
          propertyValue: 0
        }
      };
      repairs.push(`Created blank mortgage details for ${item.name}.`);
    }
    if (type === "studentLoan" && !isObject(item.studentLoanDetails)) {
      item = { ...item, studentLoanDetails: { planType: "plan2", grossAnnualSalary: 0, payFrequency: "monthly", employmentType: "PAYE" } };
      repairs.push(`Created blank student loan details for ${item.name}.`);
    }
    return item;
  });

  const nextLoanIds = new Set(next.loans.map(loan => loan.id).filter(Boolean));
  const nextTransactionIds = new Set(next.transactions.map(transaction => transaction.id).filter(Boolean));
  next.loanEvents = (data.loanEvents || [])
    .map((event, index) => {
      const item = repairRecordId(event, "loan_event");
      if (!event.id) repairs.push(`Assigned ID to loan event ${index + 1}.`);
      return item;
    })
    .filter(event => {
      const hasLoan = !event.loanId || nextLoanIds.has(event.loanId);
      const hasTransaction = !event.transactionId || nextTransactionIds.has(event.transactionId);
      if (!hasLoan || !hasTransaction) repairs.push(`Removed orphaned loan event ${event.id}.`);
      return hasLoan && hasTransaction;
    });

  const nextData = normaliseAppData({
    ...next,
    settings: {
      ...next.settings,
      lastValidationRepairAt: now,
      lastValidationRepairCount: repairs.length,
      lastValidationReportAt: report.createdAt || now
    }
  });

  return {
    data: nextData,
    repairs,
    repairedAt: now,
    previousReport: report,
    nextReport: validateCurrentAppData(nextData)
  };
}
