// Empty forms and validation rules for the Loans and House pop-ups.
import { checkMoneyAmount, checkRequiredText, collectErrors } from "../../utils/validation.js";
import { todayIsoDate } from "../../utils/dates.js";

export const blankHouseForm = {
  name: "",
  addressLabel: "",
  purchasePrice: "",
  purchaseDate: "",
  propertyValue: "",
  agreementNotes: "",
  notes: "",
  ownershipMode: "contributionTracking",
  mortgageOriginalAmount: "",
  mortgageCurrentBalance: "",
  mortgageStartDate: "",
  mortgageTermYears: "",
  mortgageRemainingTermMonths: "",
  mortgageInterestRate: "",
  mortgageRateType: "fixed",
  mortgageRepaymentType: "repayment",
  mortgageFixedEndDate: "",
  mortgageFollowOnRate: "",
  mortgageMonthlyPayment: "",
  mortgagePaymentDay: "1",
  mortgagePlannedMonthlyOverpayment: "",
  mortgageOverpaymentAllowancePercent: "10",
  mortgageEarlyRepaymentChargeApplies: false,
  mortgageNotes: "",
  linkedAccountId: ""
};

export const blankContributionForm = {
  personId: "",
  personName: "",
  amount: "",
  date: todayIsoDate(),
  type: "deposit",
  sourceType: "external",
  linkedTransactionId: "",
  notes: ""
};

export const blankPersonForm = {
  name: "",
  email: "",
  label: "",
  ownershipPercentage: ""
};

export const blankLoanForm = {
  type: "studentLoan",
  name: "",
  originalAmount: "",
  currentBalance: "",
  balanceDate: todayIsoDate(),
  startDate: "",
  notes: "",

  planType: "plan2",
  repaymentStartDate: "",
  grossAnnualSalary: "",
  payFrequency: "monthly",
  employmentType: "PAYE",
  salaryGrowthPercent: "",
  manualAnnualInterestRate: "",

  repaymentType: "repayment",
  termYears: "25",
  remainingTermMonths: "",
  monthlyPayment: "",
  paymentDay: "1",
  interestType: "fixed",
  currentRate: "",
  fixedUntil: "",
  followOnRate: "",
  plannedMonthlyOverpayment: "0",
  overpaymentAllowancePercent: "10",
  earlyRepaymentChargeApplies: false,
  propertyValue: ""
};

export function validateHouseForm(values) {
  return collectErrors({ name: checkRequiredText(values.name, "a name for the house, for example Home") });
}

export function validateContributionForm(values) {
  return collectErrors({
    amount: checkMoneyAmount(values.amount, { example: "500" }),
    linkedTransactionId: values.sourceType === "linkedTransaction" && !values.linkedTransactionId
      ? "Choose the transaction this contribution links to, or change Source."
      : ""
  });
}

export function validatePersonForm(values) {
  return collectErrors({ name: checkRequiredText(values.name, "the person's name") });
}

export function validateLoanForm(values) {
  return collectErrors({
    name: checkRequiredText(values.name, "a name for the loan, for example Plan 2 Student Loan"),
    currentBalance: checkMoneyAmount(values.currentBalance, { required: false, allowZero: true, example: "52000" })
  });
}

export function validateBalanceUpdateForm(values) {
  return collectErrors({ balance: checkMoneyAmount(values.balance, { allowZero: true, example: "48250.00" }) });
}
