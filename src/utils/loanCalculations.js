import { getStudentLoanPlan } from "../data/studentLoanPlans.js";
import { addMonthsToIsoDate, addYearsToIsoDate } from "./dates.js";

export function calculateLoanSummary(data) {
  const loans = Array.isArray(data.loans) ? data.loans.filter(loan => loan.status !== "closed" && loan.status !== "archived") : [];
  const estimates = loans.map(loan => calculateLoanEstimate(loan));

  const totalDebt = sum(loans.map(loan => Number(loan.currentBalance || 0)));
  const monthlyRepayments = sum(estimates.map(item => item.monthlyRepayment));
  const monthlyInterest = sum(estimates.map(item => item.monthlyInterest));
  const capitalRepaid = sum(estimates.map(item => item.monthlyCapitalPaid));
  const mortgageDebt = sum(loans.filter(loan => loan.type === "mortgage").map(loan => Number(loan.currentBalance || 0)));
  const studentDebt = sum(loans.filter(loan => loan.type === "studentLoan").map(loan => Number(loan.currentBalance || 0)));

  const nextImportantDate = getNextImportantLoanDate(loans);

  return {
    loans,
    estimates,
    totalDebt,
    monthlyRepayments,
    monthlyInterest,
    capitalRepaid,
    mortgageDebt,
    studentDebt,
    nextImportantDate
  };
}

export function calculateLoanEstimate(loan) {
  if (loan?.type === "studentLoan") return calculateStudentLoanEstimate(loan);
  if (loan?.type === "mortgage") return calculateMortgageEstimate(loan);
  return calculateGenericLoanEstimate(loan);
}

export function calculateStudentLoanEstimate(loan) {
  const details = loan.studentLoanDetails || {};
  const plan = getStudentLoanPlan(details.planType);
  const salary = Number(details.grossAnnualSalary || 0);
  const threshold = Number(plan.annualThreshold || 0);
  const repaymentRate = Number(plan.repaymentRate || 0);
  const annualInterestRate = details.manualAnnualInterestRate !== null && details.manualAnnualInterestRate !== undefined && details.manualAnnualInterestRate !== ""
    ? Number(details.manualAnnualInterestRate)
    : resolveStudentLoanInterestRate(plan, salary);
  const balance = Number(loan.currentBalance || 0);

  const annualRepayment = Math.max(0, salary - threshold) * repaymentRate;
  const monthlyRepayment = annualRepayment / 12;
  const monthlyInterest = balance * (annualInterestRate / 100) / 12;
  const monthlyCapitalPaid = Math.max(0, monthlyRepayment - monthlyInterest);
  const projectedPayoffMonths = monthlyCapitalPaid > 0 ? Math.ceil(balance / monthlyCapitalPaid) : null;
  const projectedWriteOffDate = getProjectedWriteOffDate(details.repaymentStartDate, plan.writeOffYears);

  return {
    type: "studentLoan",
    plan,
    annualInterestRate,
    annualRepayment,
    monthlyRepayment,
    monthlyInterest,
    monthlyCapitalPaid,
    projectedPayoffMonths,
    projectedWriteOffDate,
    warning: monthlyRepayment <= monthlyInterest && balance > 0
      ? "Estimated repayment is lower than estimated interest, so the balance may grow."
      : "Estimated repayment is reducing the balance."
  };
}

export function calculateMortgageEstimate(loan) {
  const details = loan.mortgageDetails || {};
  const balance = Number(loan.currentBalance || 0);
  const annualInterestRate = Number(details.currentRate || 0);
  const monthlyPayment = Number(details.monthlyPayment || 0);
  const plannedOverpayment = Number(details.plannedMonthlyOverpayment || 0);
  const monthlyInterest = balance * (annualInterestRate / 100) / 12;
  const monthlyRepayment = monthlyPayment + plannedOverpayment;
  const monthlyCapitalPaid = Math.max(0, monthlyRepayment - monthlyInterest);
  const remainingTermMonths = Number(details.remainingTermMonths || details.termYears * 12 || 0);
  const payoff = simulateMortgage(balance, annualInterestRate, monthlyPayment, plannedOverpayment, remainingTermMonths);
  const noOverpayPayoff = simulateMortgage(balance, annualInterestRate, monthlyPayment, 0, remainingTermMonths);

  return {
    type: "mortgage",
    annualInterestRate,
    monthlyRepayment,
    monthlyInterest,
    monthlyCapitalPaid,
    projectedPayoffMonths: payoff.months,
    projectedTotalInterest: payoff.totalInterest,
    noOverpayMonths: noOverpayPayoff.months,
    noOverpayTotalInterest: noOverpayPayoff.totalInterest,
    overpaymentInterestSaved: Math.max(0, noOverpayPayoff.totalInterest - payoff.totalInterest),
    overpaymentMonthsSaved: Math.max(0, noOverpayPayoff.months - payoff.months),
    projectionSeries: buildProjectionSeries(balance, annualInterestRate, monthlyPayment, plannedOverpayment, Math.min(payoff.months || remainingTermMonths || 360, 360)),
    warning: monthlyRepayment <= monthlyInterest && balance > 0
      ? "Payment is not covering estimated interest. Check the rate/payment details."
      : "Payment is reducing the balance."
  };
}

export function calculateGenericLoanEstimate(loan) {
  const balance = Number(loan?.currentBalance || 0);
  const annualInterestRate = Number(loan?.annualInterestRate || 0);
  const monthlyPayment = Number(loan?.monthlyPayment || 0);
  const monthlyInterest = balance * (annualInterestRate / 100) / 12;
  const monthlyCapitalPaid = Math.max(0, monthlyPayment - monthlyInterest);

  return {
    type: "otherLoan",
    annualInterestRate,
    monthlyRepayment: monthlyPayment,
    monthlyInterest,
    monthlyCapitalPaid,
    projectedPayoffMonths: monthlyCapitalPaid > 0 ? Math.ceil(balance / monthlyCapitalPaid) : null,
    warning: "Basic loan estimate only."
  };
}

export function simulateMortgage(startBalance, annualRatePercent, monthlyPayment, monthlyOverpayment = 0, maxMonths = 600) {
  let balance = Number(startBalance || 0);
  const monthlyRate = Number(annualRatePercent || 0) / 100 / 12;
  const payment = Number(monthlyPayment || 0) + Number(monthlyOverpayment || 0);
  let totalInterest = 0;
  let months = 0;

  if (balance <= 0) return { months: 0, totalInterest: 0, finalBalance: 0 };
  if (payment <= 0) return { months: null, totalInterest: 0, finalBalance: balance };

  const hardLimit = Math.max(Number(maxMonths || 0), 1);

  while (balance > 0.01 && months < hardLimit) {
    const interest = balance * monthlyRate;
    totalInterest += interest;

    if (payment <= interest && monthlyRate > 0) {
      return { months: null, totalInterest, finalBalance: balance };
    }

    balance = Math.max(0, balance + interest - payment);
    months += 1;
  }

  return { months, totalInterest, finalBalance: balance };
}

export function buildProjectionSeries(startBalance, annualRatePercent, monthlyPayment, monthlyOverpayment = 0, maxMonths = 360) {
  let balance = Number(startBalance || 0);
  const monthlyRate = Number(annualRatePercent || 0) / 100 / 12;
  const payment = Number(monthlyPayment || 0) + Number(monthlyOverpayment || 0);
  const points = [{ month: 0, label: "Now", balance: roundCurrency(balance) }];

  if (balance <= 0 || payment <= 0) return points;

  const limit = Math.min(Math.max(Number(maxMonths || 0), 1), 360);
  for (let month = 1; month <= limit; month += 1) {
    const interest = balance * monthlyRate;
    if (payment <= interest && monthlyRate > 0) break;
    balance = Math.max(0, balance + interest - payment);

    if (month % 12 === 0 || balance <= 0.01 || month === limit) {
      points.push({
        month,
        label: month < 12 ? `${month}m` : `${Math.round(month / 12)}y`,
        balance: roundCurrency(balance)
      });
    }

    if (balance <= 0.01) break;
  }

  return points;
}

export function getProjectedDateFromMonths(months, fromDate = new Date()) {
  if (!Number.isFinite(Number(months)) || Number(months) < 0) return null;
  return addMonthsToIsoDate(fromDate, Number(months));
}

function resolveStudentLoanInterestRate(plan, salary) {
  if (plan.interestType !== "income-linked-variable") return Number(plan.annualInterestRate || 0);

  const lowerSalary = Number(plan.lowerInterestThreshold || plan.annualThreshold || 0);
  const upperSalary = Number(plan.upperInterestThreshold || lowerSalary || 0);
  const minRate = Number(plan.minAnnualInterestRate ?? plan.annualInterestRate ?? 0);
  const maxRate = Number(plan.maxAnnualInterestRate ?? minRate);

  if (!Number.isFinite(salary) || salary <= lowerSalary || upperSalary <= lowerSalary) return minRate;
  if (salary >= upperSalary) return maxRate;

  const ratio = (salary - lowerSalary) / (upperSalary - lowerSalary);
  return Math.round((minRate + ((maxRate - minRate) * ratio)) * 100) / 100;
}

function getProjectedWriteOffDate(repaymentStartDate, writeOffYears) {
  if (!repaymentStartDate || !writeOffYears) return null;
  const date = new Date(repaymentStartDate);
  if (Number.isNaN(date.getTime())) return null;
  return addYearsToIsoDate(repaymentStartDate, Number(writeOffYears));
}

function getNextImportantLoanDate(loans) {
  const datedItems = loans
    .flatMap(loan => {
      const items = [];
      if (loan.type === "mortgage" && loan.mortgageDetails?.fixedUntil) {
        items.push({ date: loan.mortgageDetails.fixedUntil, label: `${loan.name} fixed rate ends` });
      }
      if (loan.type === "mortgage" && loan.mortgageDetails?.paymentDay) {
        items.push({ date: nextPaymentDate(Number(loan.mortgageDetails.paymentDay)), label: `${loan.name} payment due` });
      }
      return items;
    })
    .filter(item => item.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return datedItems[0] || null;
}

function nextPaymentDate(paymentDay) {
  const now = new Date();
  const safeDay = Math.min(Math.max(paymentDay || 1, 1), 28);
  let date = new Date(now.getFullYear(), now.getMonth(), safeDay);
  if (date < now) date = new Date(now.getFullYear(), now.getMonth() + 1, safeDay);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}
