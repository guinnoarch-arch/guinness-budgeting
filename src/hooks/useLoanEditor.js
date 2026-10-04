import { useState } from "react";
import { createId } from "../utils/ids.js";
import { todayIsoDate } from "../utils/dates.js";
import { blankLoanForm, validateBalanceUpdateForm, validateLoanForm } from "../components/loans/loanForms.js";
import { useModalFormErrors } from "./useModalFormErrors.js";

// Adding, editing, archiving and deleting loans, and recording a new
// balance from a statement.
export default function useLoanEditor({ actions, setSelectedLoanId }) {
  const [showLoanModal, setShowLoanModal] = useState(false);

  const [editingLoan, setEditingLoan] = useState(null);

  const [loanForm, setLoanForm] = useState(blankLoanForm);

  const [balanceUpdateLoan, setBalanceUpdateLoan] = useState(null);

  const [balanceUpdate, setBalanceUpdate] = useState({ balance: "", date: todayIsoDate(), note: "" });

  const loanValidation = useModalFormErrors("loan", validateLoanForm, showLoanModal, loanForm);

  const balanceValidation = useModalFormErrors("loan-balance", validateBalanceUpdateForm, Boolean(balanceUpdateLoan), balanceUpdate);

  function updateLoanForm(field, value) {
    setLoanForm(prev => ({ ...prev, [field]: value }));
  }

  function openAddLoanModal(type = "studentLoan") {
    const defaultPlan = type === "studentLoan" ? "plan2" : blankLoanForm.planType;
    setEditingLoan(null);
    setLoanForm({
      ...blankLoanForm,
      type,
      planType: defaultPlan,
      name: type === "mortgage" ? "Mortgage" : "Student loan"
    });
    setShowLoanModal(true);
  }

  function openEditLoanModal(loan) {
    setEditingLoan(loan);
    const studentDetails = loan.studentLoanDetails || {};
    const mortgageDetails = loan.mortgageDetails || {};

    setLoanForm({
      ...blankLoanForm,
      type: loan.type || "studentLoan",
      name: loan.name || "",
      originalAmount: String(loan.originalAmount ?? ""),
      currentBalance: String(loan.currentBalance ?? ""),
      balanceDate: loan.balanceDate || todayIsoDate(),
      startDate: loan.startDate || "",
      notes: loan.notes || "",

      planType: studentDetails.planType || "plan2",
      repaymentStartDate: studentDetails.repaymentStartDate || "",
      grossAnnualSalary: String(studentDetails.grossAnnualSalary ?? ""),
      payFrequency: studentDetails.payFrequency || "monthly",
      employmentType: studentDetails.employmentType || "PAYE",
      salaryGrowthPercent: String(studentDetails.salaryGrowthPercent ?? ""),
      manualAnnualInterestRate: String(studentDetails.manualAnnualInterestRate ?? ""),

      repaymentType: mortgageDetails.repaymentType || "repayment",
      termYears: String(mortgageDetails.termYears ?? "25"),
      remainingTermMonths: String(mortgageDetails.remainingTermMonths ?? ""),
      monthlyPayment: String(mortgageDetails.monthlyPayment ?? ""),
      paymentDay: String(mortgageDetails.paymentDay ?? "1"),
      interestType: mortgageDetails.interestType || "fixed",
      currentRate: String(mortgageDetails.currentRate ?? ""),
      fixedUntil: mortgageDetails.fixedUntil || "",
      followOnRate: String(mortgageDetails.followOnRate ?? ""),
      plannedMonthlyOverpayment: String(mortgageDetails.plannedMonthlyOverpayment ?? "0"),
      overpaymentAllowancePercent: String(mortgageDetails.overpaymentAllowancePercent ?? "10"),
      earlyRepaymentChargeApplies: Boolean(mortgageDetails.earlyRepaymentChargeApplies),
      propertyValue: String(mortgageDetails.propertyValue ?? "")
    });
    setShowLoanModal(true);
  }

  function closeLoanModal() {
    setShowLoanModal(false);
    setEditingLoan(null);
    setLoanForm(blankLoanForm);
  }

  function submitLoan(event) {
    event.preventDefault();

    const name = loanForm.name.trim();
    const currentBalance = Number(loanForm.currentBalance || 0);
    const originalAmount = Number(loanForm.originalAmount || 0);
    const now = new Date().toISOString();

    if (!loanValidation.validateAll(loanForm)) return;

    const loanPayload = {
      id: editingLoan?.id || createId("loan"),
      type: loanForm.type,
      name,
      originalAmount: Number.isFinite(originalAmount) ? originalAmount : 0,
      currentBalance,
      balanceDate: loanForm.balanceDate || todayIsoDate(),
      startDate: loanForm.startDate || null,
      status: editingLoan?.status || "active",
      notes: loanForm.notes.trim(),
      isExample: editingLoan?.isExample || false,
      createdAt: editingLoan?.createdAt || now,
      updatedAt: now,
      studentLoanDetails: loanForm.type === "studentLoan" ? {
        planType: loanForm.planType,
        repaymentStartDate: loanForm.repaymentStartDate || null,
        grossAnnualSalary: Number(loanForm.grossAnnualSalary || 0),
        payFrequency: loanForm.payFrequency,
        employmentType: loanForm.employmentType,
        salaryGrowthPercent: Number(loanForm.salaryGrowthPercent || 0),
        manualAnnualInterestRate: loanForm.manualAnnualInterestRate === "" ? null : Number(loanForm.manualAnnualInterestRate)
      } : null,
      mortgageDetails: loanForm.type === "mortgage" ? {
        repaymentType: loanForm.repaymentType,
        termYears: Number(loanForm.termYears || 0),
        remainingTermMonths: Number(loanForm.remainingTermMonths || 0),
        monthlyPayment: Number(loanForm.monthlyPayment || 0),
        paymentDay: Number(loanForm.paymentDay || 1),
        interestType: loanForm.interestType,
        currentRate: Number(loanForm.currentRate || 0),
        fixedUntil: loanForm.fixedUntil || null,
        followOnRate: Number(loanForm.followOnRate || 0),
        plannedMonthlyOverpayment: Number(loanForm.plannedMonthlyOverpayment || 0),
        overpaymentAllowancePercent: Number(loanForm.overpaymentAllowancePercent || 0),
        earlyRepaymentChargeApplies: Boolean(loanForm.earlyRepaymentChargeApplies),
        propertyValue: Number(loanForm.propertyValue || 0)
      } : null
    };

    actions.updateAppData(prev => ({
      ...prev,
      loans: editingLoan
        ? (prev.loans || []).map(loan => loan.id === editingLoan.id ? loanPayload : loan)
        : [...(prev.loans || []), loanPayload]
    }));

    setSelectedLoanId(loanPayload.id);
    closeLoanModal();
  }

  function archiveLoan(loan) {
    const confirmed = window.confirm(`Archive ${loan.name}? It will be hidden from active loan totals but kept in history.`);
    if (!confirmed) return;

    actions.updateAppData(prev => ({
      ...prev,
      loans: (prev.loans || []).map(existing => existing.id === loan.id
        ? { ...existing, status: "archived", archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : existing
      )
    }));
    setSelectedLoanId(null);
  }

  function restoreLoan(loan) {
    actions.updateAppData(prev => ({
      ...prev,
      loans: (prev.loans || []).map(existing => existing.id === loan.id
        ? { ...existing, status: "active", archivedAt: null, updatedAt: new Date().toISOString() }
        : existing
      )
    }));
    setSelectedLoanId(loan.id);
  }

  function deleteLoan(loan) {
    const confirmed = window.confirm(`Permanently delete ${loan.name}? This removes the loan and its loan-event history.`);
    if (!confirmed) return;

    actions.updateAppData(prev => ({
      ...prev,
      loans: (prev.loans || []).filter(existing => existing.id !== loan.id),
      loanEvents: (prev.loanEvents || []).filter(event => event.loanId !== loan.id)
    }));
  }

  function openBalanceUpdate(loan) {
    setBalanceUpdateLoan(loan);
    setBalanceUpdate({ balance: String(loan.currentBalance ?? ""), date: todayIsoDate(), note: "Manual balance update" });
  }

  function submitBalanceUpdate(event) {
    event.preventDefault();
    if (!balanceUpdateLoan) return;

    if (!balanceValidation.validateAll(balanceUpdate)) return;
    const newBalance = Number(balanceUpdate.balance);

    const oldBalance = Number(balanceUpdateLoan.currentBalance || 0);
    const now = new Date().toISOString();
    const eventPayload = {
      id: createId("loan_event"),
      loanId: balanceUpdateLoan.id,
      date: balanceUpdate.date || todayIsoDate(),
      type: "balanceAdjustment",
      amount: newBalance - oldBalance,
      previousBalance: oldBalance,
      newBalance,
      note: balanceUpdate.note || "Manual balance update",
      createdAt: now
    };

    actions.updateAppData(prev => ({
      ...prev,
      loans: (prev.loans || []).map(loan => loan.id === balanceUpdateLoan.id
        ? { ...loan, currentBalance: newBalance, balanceDate: eventPayload.date, updatedAt: now }
        : loan
      ),
      loanEvents: [...(prev.loanEvents || []), eventPayload]
    }));

    setSelectedLoanId(balanceUpdateLoan.id);
    setBalanceUpdateLoan(null);
    setBalanceUpdate({ balance: "", date: todayIsoDate(), note: "" });
  }

  return {
    archiveLoan,
    balanceUpdate,
    balanceUpdateLoan,
    balanceValidation,
    closeLoanModal,
    deleteLoan,
    editingLoan,
    loanForm,
    loanValidation,
    openAddLoanModal,
    openBalanceUpdate,
    openEditLoanModal,
    restoreLoan,
    setBalanceUpdate,
    setBalanceUpdateLoan,
    showLoanModal,
    submitBalanceUpdate,
    submitLoan,
    updateLoanForm
  };
}
