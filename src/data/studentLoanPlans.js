// UK student-loan tracker assumptions.
// Effective for 2026/27 repayment thresholds from 6 April 2026.
// Interest values reflect the currently published GOV.UK figures at the time this patch was prepared.
// Keep this file easy to update because thresholds/rates change.

export const studentLoanPlans = {
  plan1: {
    id: "plan1",
    label: "Plan 1",
    country: "England/Wales/Northern Ireland older loans",
    annualThreshold: 26900,
    monthlyThreshold: 2241.66,
    weeklyThreshold: 517.30,
    repaymentRate: 0.09,
    annualInterestRate: 3.2,
    interestDescription: "Current published rate: 3.2%.",
    writeOffYears: null,
    writeOffNote: "Plan 1 cancellation depends on when the loan was taken out, so enter your own note/check SLC."
  },
  plan2: {
    id: "plan2",
    label: "Plan 2",
    country: "England/Wales undergraduate loans from 2012 to 2023 entry",
    annualThreshold: 29385,
    monthlyThreshold: 2448.75,
    weeklyThreshold: 565.09,
    repaymentRate: 0.09,
    annualInterestRate: 3.2,
    minAnnualInterestRate: 3.2,
    maxAnnualInterestRate: 6.2,
    lowerInterestThreshold: 29385,
    upperInterestThreshold: 52885,
    interestType: "income-linked-variable",
    interestDescription: "Current published Plan 2 range: 3.2% to 6.2%, depending on salary/status.",
    writeOffYears: 30,
    writeOffNote: "Usually written off 30 years after repayments become due."
  },
  plan4: {
    id: "plan4",
    label: "Plan 4",
    country: "Scotland",
    annualThreshold: 33795,
    monthlyThreshold: 2816.25,
    weeklyThreshold: 649.90,
    repaymentRate: 0.09,
    annualInterestRate: 3.2,
    interestDescription: "Current published rate: 3.2%.",
    writeOffYears: null,
    writeOffNote: "Plan 4 cancellation depends on Scottish loan terms; check SLC for exact cancellation date."
  },
  plan5: {
    id: "plan5",
    label: "Plan 5",
    country: "England undergraduate loans from 2023 entry",
    annualThreshold: 25000,
    monthlyThreshold: 2083.33,
    weeklyThreshold: 480.76,
    repaymentRate: 0.09,
    annualInterestRate: 3.2,
    interestDescription: "Current published rate: 3.2%.",
    writeOffYears: 40,
    writeOffNote: "Usually written off 40 years after repayments become due."
  },
  postgraduate: {
    id: "postgraduate",
    label: "Postgraduate Loan",
    country: "UK postgraduate loan",
    annualThreshold: 21000,
    monthlyThreshold: 1750,
    weeklyThreshold: 403.84,
    repaymentRate: 0.06,
    annualInterestRate: 6.2,
    interestDescription: "Current published rate: 6.2%.",
    writeOffYears: 30,
    writeOffNote: "Usually written off 30 years after repayments become due."
  }
};

export function getStudentLoanPlan(planType) {
  return studentLoanPlans[planType] || studentLoanPlans.plan2;
}

export const studentLoanPlanOptions = Object.values(studentLoanPlans);
