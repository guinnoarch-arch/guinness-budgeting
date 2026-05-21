import { formatIsoDateLocal, getMonthKey, isInMonth } from "./dates.js";

export function getActiveLoans(data) {
  return (data?.loans || []).filter(loan => loan && loan.status !== "archived" && loan.status !== "closed");
}

export function getLoanById(data, loanId) {
  if (!loanId) return null;
  return (data?.loans || []).find(loan => loan.id === loanId) || null;
}

export function getLinkedLoanId(transaction) {
  return transaction?.linkedLoanId || transaction?.loanId || transaction?.relatedLoanId || transaction?.mortgageLoanId || "";
}

export function isLoanLinkedTransaction(transaction) {
  return Boolean(getLinkedLoanId(transaction));
}

export function getLinkedLoanTransactions(data, loanId, options = {}) {
  const monthKey = options.monthKey || null;
  const startDate = options.startDate || null;
  const endDate = options.endDate || null;

  return (data?.transactions || [])
    .filter(transaction => {
      if (transaction.type !== "expense") return false;
      if (getLinkedLoanId(transaction) !== loanId) return false;
      const date = transaction.date || "";
      if (monthKey && !isInMonth(date, monthKey)) return false;
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    })
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

export function getTransactionLoanSplit(transaction, loan = null) {
  const paymentAmount = Math.abs(Number(transaction?.amount || 0));
  const explicitInterest = readNumeric(transaction?.loanInterestAmount ?? transaction?.interestAmount ?? transaction?.mortgageInterestAmount ?? transaction?.loanSplit?.interest);
  const explicitPrincipal = readNumeric(transaction?.loanPrincipalAmount ?? transaction?.principalAmount ?? transaction?.mortgagePrincipalAmount ?? transaction?.loanSplit?.principal);
  const explicitOverpayment = readNumeric(transaction?.loanOverpaymentAmount ?? transaction?.overpaymentAmount ?? transaction?.mortgageOverpaymentAmount ?? transaction?.loanSplit?.overpayment);

  let interestAmount = explicitInterest;
  let principalAmount = explicitPrincipal;

  if (interestAmount === null && principalAmount === null && loan) {
    const estimated = estimateLoanPaymentSplit(paymentAmount, loan);
    interestAmount = estimated.interestAmount;
    principalAmount = estimated.principalAmount;
  } else if (interestAmount === null && principalAmount !== null) {
    interestAmount = Math.max(0, paymentAmount - principalAmount);
  } else if (principalAmount === null && interestAmount !== null) {
    principalAmount = Math.max(0, paymentAmount - interestAmount);
  }

  interestAmount = roundCurrency(Math.max(0, Number(interestAmount || 0)));
  principalAmount = roundCurrency(Math.max(0, Number(principalAmount || 0)));

  const overpaymentAmount = explicitOverpayment === null
    ? (transaction?.isLoanOverpayment ? principalAmount : 0)
    : Math.max(0, Number(explicitOverpayment || 0));

  return {
    paymentAmount: roundCurrency(paymentAmount),
    interestAmount,
    principalAmount,
    overpaymentAmount: roundCurrency(Math.min(paymentAmount, overpaymentAmount)),
    isOverpayment: Boolean(transaction?.isLoanOverpayment) || Number(overpaymentAmount || 0) > 0,
    wasEstimated: explicitInterest === null || explicitPrincipal === null
  };
}

export function estimateLoanPaymentSplit(paymentAmount, loan) {
  const amount = Math.abs(Number(paymentAmount || 0));
  if (!loan || amount <= 0) {
    return { interestAmount: 0, principalAmount: amount };
  }

  if (loan.type === "mortgage") {
    const balance = Number(loan.currentBalance || 0);
    const annualRate = Number(loan.mortgageDetails?.currentRate || 0);
    const estimatedMonthlyInterest = Math.max(0, balance * (annualRate / 100) / 12);
    const interestAmount = Math.min(amount, estimatedMonthlyInterest);
    return {
      interestAmount: roundCurrency(interestAmount),
      principalAmount: roundCurrency(Math.max(0, amount - interestAmount))
    };
  }

  if (loan.type === "studentLoan") {
    return { interestAmount: 0, principalAmount: roundCurrency(amount) };
  }

  return { interestAmount: 0, principalAmount: roundCurrency(amount) };
}

export function buildLoanEventFromTransaction(transaction, loan) {
  const loanId = getLinkedLoanId(transaction);
  if (!loanId || transaction.type !== "expense") return null;

  const split = getTransactionLoanSplit(transaction, loan);
  const now = new Date().toISOString();

  return {
    id: transaction.linkedLoanEventId || `loan_event_${transaction.id}`,
    loanId,
    transactionId: transaction.id,
    source: "transaction",
    date: transaction.date,
    type: split.isOverpayment ? "overpayment" : "repayment",
    amount: -split.principalAmount,
    paymentAmount: split.paymentAmount,
    interestAmount: split.interestAmount,
    principalAmount: split.principalAmount,
    overpaymentAmount: split.overpaymentAmount,
    note: transaction.title || "Linked loan payment",
    createdAt: transaction.createdAt || now,
    updatedAt: now,
    isExample: Boolean(transaction.isExample)
  };
}

export function syncLoanEventsForTransaction(data, transaction) {
  const loanId = getLinkedLoanId(transaction);
  const loan = getLoanById(data, loanId);
  const event = buildLoanEventFromTransaction(transaction, loan);
  const existingEvents = (data.loanEvents || []).filter(item => item.transactionId !== transaction.id);

  return {
    ...data,
    loanEvents: event ? [event, ...existingEvents] : existingEvents
  };
}

export function removeLoanEventsForTransaction(data, transactionId) {
  return {
    ...data,
    loanEvents: (data.loanEvents || []).filter(event => event.transactionId !== transactionId)
  };
}

export function getLoanTimelineEvents(data, loan) {
  const stored = (data?.loanEvents || []).filter(event => event.loanId === loan.id);
  const storedTransactionIds = new Set(stored.map(event => event.transactionId).filter(Boolean));
  const synthetic = getLinkedLoanTransactions(data, loan.id)
    .filter(transaction => !storedTransactionIds.has(transaction.id))
    .map(transaction => buildLoanEventFromTransaction(transaction, loan))
    .filter(Boolean);

  return [...stored, ...synthetic]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function getLoanPaymentTotalsForMonth(data, monthKey) {
  const linkedTransactions = (data?.transactions || []).filter(transaction => transaction.type === "expense" && isLoanLinkedTransaction(transaction) && isInMonth(transaction.date, monthKey));

  return linkedTransactions.reduce((totals, transaction) => {
    const loan = getLoanById(data, getLinkedLoanId(transaction));
    const split = getTransactionLoanSplit(transaction, loan);
    totals.paymentAmount += split.paymentAmount;
    totals.interestAmount += split.interestAmount;
    totals.principalAmount += split.principalAmount;
    totals.overpaymentAmount += split.overpaymentAmount;
    totals.count += 1;
    if (loan?.type === "mortgage") totals.mortgagePayments += split.paymentAmount;
    if (loan?.type === "studentLoan") totals.studentLoanPayments += split.paymentAmount;
    return totals;
  }, {
    count: 0,
    paymentAmount: 0,
    interestAmount: 0,
    principalAmount: 0,
    overpaymentAmount: 0,
    mortgagePayments: 0,
    studentLoanPayments: 0
  });
}

export function getMortgageOverpaymentSummary(data, loan, referenceDate = new Date()) {
  const date = new Date(referenceDate);
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const allowancePercent = Number(loan?.mortgageDetails?.overpaymentAllowancePercent || 0);
  const baseBalance = Number(loan?.currentBalance || loan?.originalAmount || 0);
  const yearlyAllowance = Math.max(0, baseBalance * allowancePercent / 100);
  const transactions = getLinkedLoanTransactions(data, loan.id, { startDate: yearStart, endDate: yearEnd });
  const overpaidThisYear = transactions.reduce((total, transaction) => {
    const split = getTransactionLoanSplit(transaction, loan);
    return total + Number(split.overpaymentAmount || 0);
  }, 0);
  const remainingAllowance = Math.max(0, yearlyAllowance - overpaidThisYear);

  return {
    year,
    allowancePercent,
    yearlyAllowance: roundCurrency(yearlyAllowance),
    overpaidThisYear: roundCurrency(overpaidThisYear),
    remainingAllowance: roundCurrency(remainingAllowance),
    usedPercent: yearlyAllowance > 0 ? Math.min(999, roundCurrency((overpaidThisYear / yearlyAllowance) * 100)) : 0,
    transactionCount: transactions.filter(transaction => getTransactionLoanSplit(transaction, loan).overpaymentAmount > 0).length
  };
}

export function getLoanValidationWarnings(loan) {
  const warnings = [];
  const originalAmount = Number(loan?.originalAmount || 0);
  const currentBalance = Number(loan?.currentBalance || 0);

  if (!loan?.name) warnings.push("Loan name is missing.");
  if (!loan?.balanceDate) warnings.push("Balance date is missing.");
  if (!loan?.startDate) warnings.push("Start date is missing.");
  if (loan?.startDate && loan?.balanceDate && loan.balanceDate < loan.startDate) warnings.push("Balance date is before the start date.");
  if (originalAmount > 0 && currentBalance > originalAmount && loan?.type === "mortgage") warnings.push("Current mortgage balance is higher than the original amount. Check the balance or original amount.");

  if (loan?.type === "mortgage") {
    const details = loan.mortgageDetails || {};
    const monthlyPayment = Number(details.monthlyPayment || 0);
    const monthlyInterest = currentBalance * (Number(details.currentRate || 0) / 100) / 12;
    const termMonths = Number(details.remainingTermMonths || details.termYears * 12 || 0);

    if (!details.currentRate) warnings.push("Mortgage interest rate is missing.");
    if (!monthlyPayment) warnings.push("Monthly mortgage repayment is missing.");
    if (monthlyPayment > 0 && monthlyPayment <= monthlyInterest) warnings.push("Monthly repayment does not cover estimated monthly interest.");
    if (details.fixedUntil && loan.startDate && details.fixedUntil < loan.startDate) warnings.push("Fixed/rate end date is before the mortgage start date.");
    if (details.fixedUntil && termMonths > 0) {
      const roughFinalDate = new Date(loan.balanceDate || loan.startDate || new Date());
      roughFinalDate.setMonth(roughFinalDate.getMonth() + termMonths);
      if (details.fixedUntil > formatIsoDateLocal(roughFinalDate)) warnings.push("Fixed/rate end date is after the rough final mortgage date.");
    }
    if (Number(details.plannedMonthlyOverpayment || 0) > 0 && !Number(details.overpaymentAllowancePercent || 0)) warnings.push("Planned overpayment exists but no overpayment allowance is set.");
  }

  if (loan?.type === "studentLoan") {
    const details = loan.studentLoanDetails || {};
    if (!details.planType) warnings.push("Student loan plan is missing.");
    if (!Number(details.grossAnnualSalary || 0)) warnings.push("Salary is missing, so repayment estimate will be zero.");
    warnings.push("Student loan thresholds and interest rates change over time. Update plan data when GOV.UK changes them.");
  }

  return warnings;
}

function readNumeric(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.abs(number) : null;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}
