import { defaultCategories } from "./defaultCategories.js";
import { defaultAccounts } from "./defaultAccounts.js";
import { getMonthKey } from "../utils/dates.js";

const now = new Date();
const month = getMonthKey(now);
const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const previousMonth = getMonthKey(previousMonthDate);

export function getInitialAppData() {
  return {
    transactions: [
      {
        id: "txn_wages_this",
        type: "income",
        date: `${month}-01`,
        amount: 850,
        title: "Part-time wages",
        note: "Example income",
        categoryId: "cat_wages",
        accountId: "acc_current",
        fromAccountId: null,
        toAccountId: null,
        linkedSavingsGoalId: null,
        recurringItemId: null,
        isRecurring: false,
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "txn_loan_this",
        type: "income",
        date: `${month}-02`,
        amount: 600,
        title: "Maintenance loan",
        note: "Example student income",
        categoryId: "cat_maintenance_loan",
        accountId: "acc_current",
        fromAccountId: null,
        toAccountId: null,
        linkedSavingsGoalId: null,
        recurringItemId: null,
        isRecurring: false,
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "txn_rent_this",
        type: "expense",
        date: `${month}-03`,
        amount: 525,
        title: "Rent",
        note: "Monthly rent",
        categoryId: "cat_rent",
        accountId: "acc_current",
        fromAccountId: null,
        toAccountId: null,
        linkedSavingsGoalId: null,
        recurringItemId: "rec_rent",
        isRecurring: true,
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "txn_food_this",
        type: "expense",
        date: `${month}-06`,
        amount: 42.8,
        title: "Tesco food shop",
        note: "Weekly shop",
        categoryId: "cat_food",
        accountId: "acc_current",
        fromAccountId: null,
        toAccountId: null,
        linkedSavingsGoalId: null,
        recurringItemId: null,
        isRecurring: false,
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "txn_fuel_this",
        type: "expense",
        date: `${month}-09`,
        amount: 55,
        title: "Fuel",
        note: "Car fuel",
        categoryId: "cat_fuel",
        accountId: "acc_current",
        fromAccountId: null,
        toAccountId: null,
        linkedSavingsGoalId: null,
        recurringItemId: null,
        isRecurring: false,
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "txn_saving_this",
        type: "transfer",
        date: `${month}-10`,
        amount: 150,
        title: "Holiday savings transfer",
        note: "Moved to savings",
        categoryId: null,
        accountId: null,
        fromAccountId: "acc_current",
        toAccountId: "acc_savings",
        linkedSavingsGoalId: "goal_holiday",
        recurringItemId: null,
        isRecurring: false,
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "txn_income_prev",
        type: "income",
        date: `${previousMonth}-01`,
        amount: 1250,
        title: "Previous month income",
        note: "Example previous month",
        categoryId: "cat_wages",
        accountId: "acc_current",
        fromAccountId: null,
        toAccountId: null,
        linkedSavingsGoalId: null,
        recurringItemId: null,
        isRecurring: false,
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "txn_spend_prev",
        type: "expense",
        date: `${previousMonth}-12`,
        amount: 890,
        title: "Previous month spending",
        note: "Example previous month",
        categoryId: "cat_other_expense",
        accountId: "acc_current",
        fromAccountId: null,
        toAccountId: null,
        linkedSavingsGoalId: null,
        recurringItemId: null,
        isRecurring: false,
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    accounts: defaultAccounts,
    categories: defaultCategories,
    budgets: [
      { id: "bud_rent", categoryId: "cat_rent", accountId: "acc_current", month, limit: 550, isEnabled: true },
      { id: "bud_food", categoryId: "cat_food", accountId: "acc_current", month, limit: 220, isEnabled: true },
      { id: "bud_fuel", categoryId: "cat_fuel", accountId: "acc_current", month, limit: 120, isEnabled: true },
      { id: "bud_going_out", categoryId: "cat_going_out", accountId: "acc_current", month, limit: 100, isEnabled: true },
      { id: "bud_everything_else", categoryId: "cat_everything_else", accountId: "acc_current", month, limit: 80, isEnabled: true }
    ],
    recurringItems: [
      {
        id: "rec_rent",
        name: "Rent",
        amount: 525,
        amountType: "fixed",
        categoryId: "cat_rent",
        accountId: "acc_current",
        frequency: "monthly",
        nextDueDate: `${month}-03`,
        autoAdd: true,
        reminderEnabled: true,
        isActive: true,
        isExample: true
      },
      {
        id: "rec_energy",
        name: "Energy bill",
        amount: 85,
        amountType: "variable",
        categoryId: "cat_bills",
        accountId: "acc_current",
        frequency: "monthly",
        nextDueDate: `${month}-24`,
        autoAdd: false,
        reminderEnabled: true,
        isActive: true,
        isExample: true
      },
      {
        id: "rec_spotify",
        name: "Spotify",
        amount: 10.99,
        amountType: "fixed",
        categoryId: "cat_subscriptions",
        accountId: "acc_current",
        frequency: "monthly",
        nextDueDate: `${month}-20`,
        autoAdd: false,
        reminderEnabled: true,
        isActive: true,
        isExample: true
      }
    ],
    savingsGoals: [
      {
        id: "goal_holiday",
        name: "Holiday",
        targetAmount: 800,
        currentManualAmount: 250,
        linkedAccountId: "acc_savings",
        targetDate: `${now.getFullYear()}-08-01`,
        isActive: true,
        isExample: true
      }
    ],
    loans: [
      {
        id: "loan_example_student",
        type: "studentLoan",
        name: "Example Plan 2 Student Loan",
        originalAmount: 45000,
        currentBalance: 48000,
        balanceDate: `${month}-01`,
        startDate: `${now.getFullYear() - 3}-09-01`,
        status: "active",
        notes: "Example only. Replace with your real SLC statement balance.",
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        studentLoanDetails: {
          planType: "plan2",
          repaymentStartDate: `${now.getFullYear()}-04-06`,
          grossAnnualSalary: 32000,
          payFrequency: "monthly",
          employmentType: "PAYE",
          salaryGrowthPercent: 3,
          manualAnnualInterestRate: null
        },
        mortgageDetails: null
      },
      {
        id: "loan_example_mortgage",
        type: "mortgage",
        name: "Example Mortgage",
        originalAmount: 220000,
        currentBalance: 210500,
        balanceDate: `${month}-01`,
        startDate: `${now.getFullYear() - 2}-06-01`,
        status: "active",
        notes: "Example only. Replace with your lender statement details.",
        isExample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        studentLoanDetails: null,
        mortgageDetails: {
          repaymentType: "repayment",
          termYears: 25,
          remainingTermMonths: 276,
          monthlyPayment: 1150,
          paymentDay: 1,
          interestType: "fixed",
          currentRate: 4.75,
          fixedUntil: `${now.getFullYear() + 2}-06-01`,
          followOnRate: 6.5,
          plannedMonthlyOverpayment: 100,
          overpaymentAllowancePercent: 10,
          earlyRepaymentChargeApplies: true,
          propertyValue: 280000
        }
      }
    ],
    loanEvents: [],
    closedMonths: [
      {
        id: `closed_${previousMonth}`,
        month: previousMonth,
        income: 1250,
        expenses: 890,
        savingsTransfers: 100,
        carriedForward: 80,
        movedToSavings: 100,
        closedAt: new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth() + 1, 1).toISOString()
      }
    ],
    accountAdjustments: [],
    profile: {
      localProfileId: "profile_local_default",
      cloudUserId: null,
      displayName: "",
      email: "",
      profileName: "Personal Budget",
      profileType: "Personal",
      notes: "",
      currency: "GBP",
      currencySymbol: "£",
      monthMode: "calendar",
      customMonthStartDay: 1,
      syncEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    settings: {
      currency: "GBP",
      currencySymbol: "£",
      monthMode: "calendar",
      customMonthStartDay: 1,
      budgetWarningThresholds: { greenMax: 75, orangeMax: 100 },
      hasStarted: false,
      hasCompletedSetup: false,
      useExampleData: true,
      themeMode: "light",
      darkModeEnabled: false,
      dashboardLayout: "full"
    }
  };
}
