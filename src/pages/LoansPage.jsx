import { useMemo, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { studentLoanPlanOptions, getStudentLoanPlan } from "../data/studentLoanPlans.js";
import {
  calculateLoanEstimate,
  calculateLoanSummary,
  getProjectedDateFromMonths
} from "../utils/loanCalculations.js";
import { createId } from "../utils/ids.js";
import { addMonthsToIsoDate, formatIsoDateLocal, parseIsoDateLocal, todayIsoDate } from "../utils/dates.js";
import { formatMoney } from "../utils/money.js";
import {
  getLoanTimelineEvents,
  getLoanValidationWarnings,
  getMortgageOverpaymentSummary
} from "../utils/loanLinking.js";
import "../styles/loans.css";

const today = () => todayIsoDate();

const blankLoanForm = {
  type: "studentLoan",
  name: "",
  originalAmount: "",
  currentBalance: "",
  balanceDate: today(),
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

export default function LoansPage({ appData, actions }) {
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [loanForm, setLoanForm] = useState(blankLoanForm);
  const [balanceUpdateLoan, setBalanceUpdateLoan] = useState(null);
  const [balanceUpdate, setBalanceUpdate] = useState({ balance: "", date: today(), note: "" });
  const [selectedLoanId, setSelectedLoanId] = useState(null);

  const summary = useMemo(() => calculateLoanSummary(appData), [appData]);
  const loanEvents = Array.isArray(appData.loanEvents) ? appData.loanEvents : [];
  const activeLoans = summary.loans;
  const selectedLoan = activeLoans.find(loan => loan.id === selectedLoanId) || null;

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
      balanceDate: loan.balanceDate || today(),
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

    if (!name) return alert("Enter a loan name.");
    if (!Number.isFinite(currentBalance) || currentBalance < 0) return alert("Enter a valid current balance.");

    const loanPayload = {
      id: editingLoan?.id || createId("loan"),
      type: loanForm.type,
      name,
      originalAmount: Number.isFinite(originalAmount) ? originalAmount : 0,
      currentBalance,
      balanceDate: loanForm.balanceDate || today(),
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
    setBalanceUpdate({ balance: String(loan.currentBalance ?? ""), date: today(), note: "Manual balance update" });
  }

  function submitBalanceUpdate(event) {
    event.preventDefault();
    if (!balanceUpdateLoan) return;

    const newBalance = Number(balanceUpdate.balance);
    if (!Number.isFinite(newBalance) || newBalance < 0) return alert("Enter a valid balance.");

    const oldBalance = Number(balanceUpdateLoan.currentBalance || 0);
    const now = new Date().toISOString();
    const eventPayload = {
      id: createId("loan_event"),
      loanId: balanceUpdateLoan.id,
      date: balanceUpdate.date || today(),
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
    setBalanceUpdate({ balance: "", date: today(), note: "" });
  }

  const archivedLoans = (appData.loans || []).filter(loan => loan.status === "archived");

  return (
    <div className="page-grid loans-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Loans</p>
          <h2>Loans tracker</h2>
          <p className="muted">Open a tile only when you want the details. The default view keeps the debt information calm and simple.</p>
        </div>
        <div className="row-actions">
          <button type="button" className="secondary-button" onClick={() => openAddLoanModal("studentLoan")}>+ Student loan</button>
          <button type="button" className="primary-button" onClick={() => openAddLoanModal("mortgage")}>+ Mortgage</button>
        </div>
      </div>

      {activeLoans.length === 0 ? (
        <section className="card empty-state-card">
          <h3>No loans yet</h3>
          <p className="muted">Add a student loan or mortgage to start tracking balance, interest, repayments and projections.</p>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={() => openAddLoanModal("studentLoan")}>Add student loan</button>
            <button type="button" className="primary-button" onClick={() => openAddLoanModal("mortgage")}>Add mortgage</button>
          </div>
        </section>
      ) : (
        <>
          <section className="card loan-tile-section">
            <div className="section-header compact-header">
              <div>
                <h3>Your loans</h3>
                <p className="muted">Click a tile to open the balance, projection and extra details.</p>
              </div>
              <strong>{formatMoney(summary.totalDebt, false)} total tracked</strong>
            </div>

            <div className="loan-tile-grid">
              {activeLoans.map((loan, index) => (
                <LoanTile
                  key={loan.id}
                  loan={loan}
                  index={index}
                  selected={loan.id === selectedLoanId}
                  onSelect={() => setSelectedLoanId(loan.id === selectedLoanId ? null : loan.id)}
                />
              ))}
            </div>
          </section>

          {selectedLoan ? (
            <LoanDetailPanel
              loan={selectedLoan}
              events={loanEvents.filter(event => event.loanId === selectedLoan.id)}
              onEdit={() => openEditLoanModal(selectedLoan)}
              onArchive={() => archiveLoan(selectedLoan)}
              onBalanceUpdate={() => openBalanceUpdate(selectedLoan)}
              onClose={() => setSelectedLoanId(null)}
              transactions={appData.transactions || []}
              appData={appData}
            />
          ) : (
            <section className="card loan-closed-state-card">
              <h3>No loan opened</h3>
              <p className="muted">This page only shows the simple loan tiles until you choose one. That keeps the mortgage/student-loan detail out of view by default.</p>
            </section>
          )}
        </>
      )}

      <section className="card archived-budget-card">
        <div className="section-header compact-header">
          <div>
            <h3>Archived loans</h3>
            <p className="muted-text">Archived loans stay out of active totals. You can restore or permanently remove them.</p>
          </div>
        </div>

        {archivedLoans.length === 0 ? (
          <p className="muted">No archived loans yet.</p>
        ) : (
          <div className="archive-list">
            {archivedLoans.map(loan => (
              <div key={loan.id} className="archive-row">
                <div>
                  <strong>{loan.name}</strong>
                  <small>{loan.type === "mortgage" ? "Mortgage" : "Student loan"} · archived {loan.archivedAt ? loan.archivedAt.slice(0, 10) : ""}</small>
                </div>
                <div className="row-actions archive-row-actions">
                  <strong>{formatMoney(loan.currentBalance)}</strong>
                  <button type="button" className="secondary-button" onClick={() => restoreLoan(loan)}>Restore</button>
                  <button type="button" className="danger-button" onClick={() => deleteLoan(loan)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showLoanModal && (
        <LoanModal
          loanForm={loanForm}
          editingLoan={editingLoan}
          updateLoanForm={updateLoanForm}
          closeLoanModal={closeLoanModal}
          submitLoan={submitLoan}
        />
      )}

      {balanceUpdateLoan && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submitBalanceUpdate}>
            <div className="section-header">
              <h2>Update balance: {balanceUpdateLoan.name}</h2>
              <button type="button" className="icon-button" onClick={() => setBalanceUpdateLoan(null)}>×</button>
            </div>

            <div className="form-grid">
              <label>
                New balance
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={balanceUpdate.balance}
                  onChange={event => setBalanceUpdate(prev => ({ ...prev, balance: event.target.value }))}
                />
              </label>
              <label>
                Balance date
                <input
                  type="date"
                  value={balanceUpdate.date}
                  onChange={event => setBalanceUpdate(prev => ({ ...prev, date: event.target.value }))}
                />
              </label>
              <label className="full-width">
                Note
                <input
                  value={balanceUpdate.note}
                  onChange={event => setBalanceUpdate(prev => ({ ...prev, note: event.target.value }))}
                  placeholder="Statement balance update"
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setBalanceUpdateLoan(null)}>Cancel</button>
              <button className="primary-button">Save balance update</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function LoanTile({ loan, index, selected, onSelect }) {
  const isMortgage = loan.type === "mortgage";
  const fallbackName = isMortgage ? `Mortgage ${index + 1}` : `Loan ${index + 1}`;

  return (
    <button
      type="button"
      className={`loan-summary-tile ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="loan-summary-type">{isMortgage ? "Mortgage" : "Student loan"}</span>
      <strong>{loan.name || fallbackName}</strong>
      <span className="loan-summary-amount">{formatMoney(loan.currentBalance, false)}</span>
      <small>{selected ? "Click to hide details" : "Click to view details"}</small>
    </button>
  );
}

function LoanDetailPanel({ loan, events, transactions, appData, onEdit, onArchive, onBalanceUpdate, onClose }) {
  const estimate = calculateLoanEstimate(loan);
  const isMortgage = loan.type === "mortgage";
  const isStudentLoan = loan.type === "studentLoan";
  const warnings = getLoanValidationWarnings(loan);

  return (
    <section className="card loan-detail-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">{isMortgage ? "Mortgage details" : "Student loan details"}</p>
          <h3>{loan.name}</h3>
          <p className="muted">Balance checked {loan.balanceDate || "not set"}</p>
        </div>
        <div className="row-actions">
          <button type="button" className="secondary-button" onClick={onBalanceUpdate}>Update balance</button>
          <button type="button" className="secondary-button" onClick={onEdit}>Edit</button>
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          <button type="button" className="danger-button" onClick={onArchive}>Archive</button>
        </div>
      </div>

      <LoanWarnings warnings={warnings} />
      {isStudentLoan && <StudentLoanDetails loan={loan} estimate={estimate} events={events} appData={appData} />}
      {isMortgage && <MortgageLoanDetails loan={loan} estimate={estimate} events={events} transactions={transactions} appData={appData} />}
    </section>
  );
}

function StudentLoanDetails({ loan, estimate, events, appData }) {
  const details = loan.studentLoanDetails || {};
  const plan = getStudentLoanPlan(details.planType);
  const timelineEvents = appData ? getLoanTimelineEvents(appData, loan) : getRecentEvents(events);

  return (
    <div className="stack">
      <div className="loan-detail-grid">
        <div className="sub-card loan-detail-card">
          <small>Current balance</small>
          <strong>{formatMoney(loan.currentBalance)}</strong>
          <p className="muted">Manual/SLC statement balance.</p>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Plan</small>
          <strong>{plan.label}</strong>
          <p className="muted">Repays {(plan.repaymentRate * 100).toFixed(0)}% above {formatMoney(plan.annualThreshold, false)} annual threshold.</p>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Estimated monthly repayment</small>
          <strong>{formatMoney(estimate.monthlyRepayment)}</strong>
          <p className="muted">Based on salary entered.</p>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Write-off estimate</small>
          <strong>{estimate.projectedWriteOffDate || "Not enough data"}</strong>
          <p className="muted">{plan.writeOffNote}</p>
        </div>
      </div>

      <details className="loan-extra-details-card">
        <summary>Extra details</summary>
        <div className="loan-detail-grid">
          <div className="sub-card loan-detail-card">
            <small>Salary used</small>
            <strong>{formatMoney(details.grossAnnualSalary || 0, false)}</strong>
            <p className="muted">Annual estimate before tax.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Interest rate used</small>
            <strong>{estimate.annualInterestRate.toFixed(2)}%</strong>
            <p className="muted">{plan.interestDescription || "Current estimate."}</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Monthly interest</small>
            <strong>{formatMoney(estimate.monthlyInterest)}</strong>
            <p className="muted">Estimated interest added this month.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Balance movement</small>
            <strong className={estimate.monthlyCapitalPaid > 0 ? "positive-text" : "danger-text"}>{formatMoney(estimate.monthlyCapitalPaid)}</strong>
            <p className="muted">Estimated capital reduction after interest.</p>
          </div>
        </div>
        <LoanEventList events={timelineEvents} />
      </details>
    </div>
  );
}

function MortgageLoanDetails({ loan, estimate, events, transactions, appData }) {
  const details = loan.mortgageDetails || {};
  const mortgageProgress = getMortgageProgressSnapshot(loan, transactions);
  const effectiveLoan = {
    ...loan,
    currentBalance: mortgageProgress.currentBalance,
    balanceDate: mortgageProgress.currentDate
  };
  const liveEstimate = calculateLoanEstimate(effectiveLoan);
  const payoffDate = liveEstimate.projectedPayoffMonths ? getProjectedDateFromMonths(liveEstimate.projectedPayoffMonths, mortgageProgress.currentDate) : null;
  const originalAmount = mortgageProgress.originalAmount;
  const currentBalance = mortgageProgress.currentBalance;
  const totalPaidOff = mortgageProgress.totalPaidOff;
  const monthlyPayment = Number(details.monthlyPayment || 0);
  const monthlyOverpayment = Number(details.plannedMonthlyOverpayment || 0);
  const chartModel = buildMortgageChartData(effectiveLoan, liveEstimate, transactions, mortgageProgress);
  const chartData = chartModel.data;
  const hasProjection = chartData.length > 1;
  const timelineEvents = appData ? getLoanTimelineEvents(appData, loan) : getRecentEvents(events);
  const overpaymentSummary = appData ? getMortgageOverpaymentSummary(appData, loan) : null;
  const trackedInterest = getTrackedInterest(timelineEvents);
  const totalProjectedPaidAtEnd = getFinalProjectedTotalPaid(chartData);
  const totalProjectedInterestAtEnd = totalProjectedPaidAtEnd !== null && originalAmount > 0
    ? Math.max(0, totalProjectedPaidAtEnd - originalAmount)
    : null;

  return (
    <div className="stack mortgage-focused-view">
      <div className="mortgage-main-grid">
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Total balance</small>
          <strong>{formatMoney(currentBalance)}</strong>
          <p className="muted">Current amount still owed.</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card positive-card-soft">
          <small>Total paid off</small>
          <strong>{formatMoney(totalPaidOff)}</strong>
          <p className="muted">Original loan minus current balance.</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Interest rate</small>
          <strong>{Number(details.currentRate || 0).toFixed(2)}%</strong>
          <p className="muted">{details.interestType || "Rate type not set"} rate.</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Monthly repayment</small>
          <strong>{formatMoney(monthlyPayment)}</strong>
          <p className="muted">{monthlyOverpayment > 0 ? `+ ${formatMoney(monthlyOverpayment)} overpayment planned.` : "No planned overpayment."}</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Fixed finish date</small>
          <strong>{details.fixedUntil || "Not set"}</strong>
          <p className="muted">Used for rate-ending reminders.</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Final finish date</small>
          <strong>{payoffDate || "Not enough data"}</strong>
          <p className="muted">Projected from current balance, rate and payment.</p>
        </div>
      </div>

      {hasProjection ? (
        <div className="loan-chart-card mortgage-balance-chart">
          <div className="section-header compact-header">
            <div>
              <h4>Mortgage balance projection</h4>
              <p className="muted">Starts at the mortgage start date, shows total payments made so far, then fades the projected total paid line including future interest.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="timelineX"
                type="number"
                domain={chartModel.domain}
                ticks={chartModel.ticks.map(tick => tick.value)}
                tickFormatter={value => chartModel.tickLabelLookup[String(roundAxisValue(value))] || ""}
                interval={0}
              />
              <YAxis tickFormatter={value => `£${Math.round(value / 1000)}k`} />
              <Tooltip content={<MortgageChartTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="balance" name="Amount owed" stroke="var(--primary)" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="totalPaidActual" name="Total paid to date" stroke="var(--green)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
              <Line type="monotone" dataKey="totalPaidProjected" name="Projected total paid" stroke="var(--green)" strokeWidth={3} strokeDasharray="7 7" strokeOpacity={0.45} dot={false} connectNulls={false} />
              {chartData.some(point => Number.isFinite(point.linkedPaymentBalance)) && (
                <Line type="linear" dataKey="linkedPaymentBalance" name="Linked payment" stroke="var(--orange)" strokeWidth={0} dot={{ r: 5 }} activeDot={{ r: 7 }} connectNulls={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card warning-row orange">
          <strong>Mortgage projection needs balance, interest rate and monthly payment.</strong>
          <small>Add those details to see the graph and final finish estimate.</small>
        </div>
      )}

      <details className="loan-extra-details-card mortgage-extra-details">
        <summary>Extra details</summary>
        <div className="loan-detail-grid">
          <div className="sub-card loan-detail-card">
            <small>Monthly interest</small>
            <strong>{formatMoney(liveEstimate.monthlyInterest)}</strong>
            <p className="muted">Estimated interest added this month.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Total interest gained/added</small>
            <strong>{trackedInterest > 0 ? formatMoney(trackedInterest) : "Not tracked yet"}</strong>
            <p className="muted">Only counts logged interest events. Manual balance changes are kept separate.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Total projected amount paid at end</small>
            <strong>{totalProjectedPaidAtEnd !== null ? formatMoney(totalProjectedPaidAtEnd) : "Not enough data"}</strong>
            <p className="muted">Total projected payments across the mortgage, including interest.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Total projected interest at end</small>
            <strong>{totalProjectedInterestAtEnd !== null ? formatMoney(totalProjectedInterestAtEnd) : formatMoney(liveEstimate.projectedTotalInterest || 0)}</strong>
            <p className="muted">Projected total paid minus the original amount borrowed.</p>
          </div>
          <div className="sub-card loan-detail-card positive-card-soft">
            <small>Overpayment saving</small>
            <strong>{formatMoney(liveEstimate.overpaymentInterestSaved || 0, false)}</strong>
            <p className="muted">{liveEstimate.overpaymentMonthsSaved || 0} months saved from current planned overpayment.</p>
          </div>
          {overpaymentSummary && (
            <div className={`sub-card loan-detail-card ${overpaymentSummary.usedPercent >= 90 ? "warning-card-soft" : ""}`}>
              <small>Overpaid this year</small>
              <strong>{formatMoney(overpaymentSummary.overpaidThisYear)}</strong>
              <p className="muted">{overpaymentSummary.usedPercent.toFixed(1)}% of {formatMoney(overpaymentSummary.yearlyAllowance)} yearly limit used. {formatMoney(overpaymentSummary.remainingAllowance)} left.</p>
            </div>
          )}
        </div>
        <LoanEventList events={timelineEvents} />
      </details>
    </div>
  );
}

function LoanWarnings({ warnings }) {
  if (!warnings?.length) return null;

  return (
    <div className="loan-warning-list">
      {warnings.map((warning, index) => (
        <div key={`${warning}-${index}`} className="warning-row orange">
          <strong>Check this</strong>
          <small>{warning}</small>
        </div>
      ))}
    </div>
  );
}

function LoanEventList({ events }) {
  return (
    <div className="loan-event-list">
      <div className="section-header compact-header">
        <div>
          <h4>Loan event history</h4>
          <p className="muted">Includes manual balance updates and linked loan-payment transactions.</p>
        </div>
        <span className="pill">{events.length} event(s)</span>
      </div>
      {events.length === 0 ? (
        <p className="muted">No loan events yet. Link a transaction to this loan or add a manual balance update.</p>
      ) : (
        <div className="loan-event-table-wrap">
          <table className="loan-event-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Payment</th>
                <th>Interest</th>
                <th>Capital</th>
                <th>Overpayment</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.id || `${event.date}-${event.type}-${event.note}`}>
                  <td>{event.date || "—"}</td>
                  <td><span className={`pill ${event.type === "overpayment" ? "warning" : event.type === "balanceAdjustment" ? "transfer" : ""}`}>{formatEventType(event.type)}</span></td>
                  <td>{event.paymentAmount !== undefined ? formatMoney(event.paymentAmount) : "—"}</td>
                  <td>{event.interestAmount !== undefined ? formatMoney(event.interestAmount) : "—"}</td>
                  <td>{event.principalAmount !== undefined ? formatMoney(event.principalAmount) : event.amount !== undefined ? formatMoney(Math.abs(Number(event.amount || 0))) : "—"}</td>
                  <td>{Number(event.overpaymentAmount || 0) > 0 ? formatMoney(event.overpaymentAmount) : "—"}</td>
                  <td><small>{event.note || event.source || "—"}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatEventType(type) {
  if (type === "balanceAdjustment") return "Balance update";
  if (type === "overpayment") return "Overpayment";
  if (type === "repayment") return "Repayment";
  if (type === "interestAdded" || type === "interest") return "Interest";
  return type || "Event";
}

function buildMortgageChartData(loan, estimate, transactions = [], suppliedProgress = null) {
  const progress = suppliedProgress || getMortgageProgressSnapshot(loan, transactions);
  const originalAmount = progress.originalAmount;
  const currentBalance = progress.currentBalance;
  const currentDate = progress.currentDate;
  const startDate = progress.startDate;
  const currentTotalPaidToDate = progress.totalPaidToDate;

  const linkedPayments = getLinkedLoanTransactions(transactions, loan.id, startDate, currentDate);
  const chartPoints = [];

  chartPoints.push({
    date: startDate,
    label: formatChartDate(startDate),
    dateLabel: formatChartDateLong(startDate),
    balance: roundCurrency(originalAmount),
    totalPaidActual: 0,
    totalPaidProjected: null,
    pointType: "start"
  });

  let estimatedBalance = originalAmount;
  let runningTotalPaid = 0;
  let lastPaymentDate = startDate;

  linkedPayments.forEach(payment => {
    const balanceBeforePayment = applyEstimatedInterestBetweenDates(estimatedBalance, lastPaymentDate, payment.date, loan);
    const principal = estimateLinkedPrincipal(payment, balanceBeforePayment, loan);
    runningTotalPaid += Number(payment.amount || 0);
    estimatedBalance = Math.max(0, balanceBeforePayment - principal);

    chartPoints.push({
      date: payment.date,
      label: formatChartDate(payment.date),
      dateLabel: formatChartDateLong(payment.date),
      balance: roundCurrency(estimatedBalance),
      totalPaidActual: roundCurrency(runningTotalPaid),
      totalPaidProjected: null,
      linkedPaymentBalance: roundCurrency(estimatedBalance),
      linkedPaymentAmount: roundCurrency(payment.amount),
      linkedPaymentPrincipal: roundCurrency(principal),
      linkedPaymentInterest: roundCurrency(payment.interest || Math.max(0, Number(payment.amount || 0) - principal)),
      linkedPaymentTitle: payment.title,
      linkedPaymentInferred: payment.principalWasInferred,
      pointType: "linkedPayment"
    });

    lastPaymentDate = payment.date;
  });

  upsertChartPoint(chartPoints, {
    date: currentDate,
    label: formatChartDate(currentDate),
    dateLabel: isSameDate(currentDate, today()) ? `Today · ${formatChartDateLong(currentDate)}` : formatChartDateLong(currentDate),
    balance: roundCurrency(currentBalance),
    totalPaidActual: roundCurrency(currentTotalPaidToDate),
    totalPaidProjected: roundCurrency(currentTotalPaidToDate),
    pointType: "current"
  });

  buildFutureMortgagePaymentSeries(loan, estimate, currentDate, currentBalance, currentTotalPaidToDate)
    .forEach(point => chartPoints.push(point));

  const sortedPoints = chartPoints
    .filter(point => point.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return buildCompressedMortgageChartModel(sortedPoints, startDate, currentDate);
}

function getMortgageProgressSnapshot(loan, transactions = []) {
  const originalAmount = Number(loan.originalAmount || loan.currentBalance || 0);
  const baseBalance = Number(loan.currentBalance || 0);
  const baseDate = normaliseDate(loan.balanceDate) || today();
  const startDate = normaliseDate(loan.startDate) || baseDate;
  const todayDate = today();
  const latestLinkedDate = getLatestLinkedLoanTransactionDate(transactions, loan.id);
  const currentDate = [todayDate, baseDate, latestLinkedDate]
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || todayDate;

  const linkedPaymentsToCurrent = getLinkedLoanTransactions(transactions, loan.id, startDate, currentDate);
  const linkedPaymentsAfterBalanceDate = linkedPaymentsToCurrent.filter(payment => payment.date >= baseDate);
  const principalSinceBalanceDate = linkedPaymentsAfterBalanceDate.reduce((total, payment) => {
    const approximateBalance = Math.max(0, baseBalance - total);
    return total + estimateLinkedPrincipal(payment, approximateBalance, loan);
  }, 0);

  const currentBalance = roundCurrency(Math.max(0, baseBalance - principalSinceBalanceDate));
  const totalPaidOff = originalAmount > 0 ? roundCurrency(Math.max(0, originalAmount - currentBalance)) : 0;
  const linkedPaymentTotal = linkedPaymentsToCurrent.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const estimatedRegularPaidToDate = estimateRegularPaymentsToDate(loan, startDate, currentDate);
  const totalPaidToDate = roundCurrency(Math.max(totalPaidOff, linkedPaymentTotal, estimatedRegularPaidToDate));

  return {
    originalAmount,
    baseBalance,
    baseDate,
    startDate,
    currentDate,
    currentBalance,
    totalPaidOff,
    linkedPaymentTotal: roundCurrency(linkedPaymentTotal),
    principalSinceBalanceDate: roundCurrency(principalSinceBalanceDate),
    totalPaidToDate
  };
}

function getLatestLinkedLoanTransactionDate(transactions, loanId) {
  const dates = (transactions || [])
    .filter(transaction => {
      const linkedId = transaction.linkedLoanId || transaction.loanId || transaction.relatedLoanId || transaction.mortgageLoanId;
      return linkedId === loanId;
    })
    .map(transaction => normaliseDate(transaction.date))
    .filter(Boolean)
    .sort();

  return dates[dates.length - 1] || null;
}

function buildCompressedMortgageChartModel(points, startDate, currentDate) {
  const endDate = points[points.length - 1]?.date || currentDate;
  const focusStart = addMonthsToDate(currentDate, -12);
  const focusEnd = addMonthsToDate(currentDate, 12);

  const data = points.map(point => ({
    ...point,
    timelineX: compressedTimelineValue(point.date, focusStart, focusEnd)
  }));

  const ticks = buildCompressedMortgageTicks(startDate, currentDate, endDate, focusStart, focusEnd);
  const tickLabelLookup = Object.fromEntries(ticks.map(tick => [String(tick.value), tick.label]));
  const values = [...data.map(point => point.timelineX), ...ticks.map(tick => tick.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    data,
    ticks,
    tickLabelLookup,
    domain: [Math.floor(min) - 0.5, Math.ceil(max) + 0.5]
  };
}

function buildCompressedMortgageTicks(startDate, currentDate, endDate, focusStart, focusEnd) {
  const tickDates = new Set([startDate, currentDate, endDate]);

  for (let date = startOfYear(startDate); date < focusStart; date = addMonthsToDate(date, 12)) {
    if (date >= startDate) tickDates.add(date);
  }

  for (let date = startOfMonth(focusStart); date <= focusEnd; date = addMonthsToDate(date, 3)) {
    if (date >= startDate && date <= endDate) tickDates.add(date);
  }

  for (let date = startOfYear(focusEnd); date <= endDate; date = addMonthsToDate(date, 12)) {
    if (date >= focusEnd) tickDates.add(date);
  }

  return [...tickDates]
    .filter(Boolean)
    .sort()
    .map(date => {
      const inFocus = date >= focusStart && date <= focusEnd;
      const isBoundary = date === startDate || date === currentDate || date === endDate;
      return {
        date,
        value: compressedTimelineValue(date, focusStart, focusEnd),
        label: isBoundary || inFocus ? formatChartDateShort(date) : new Date(date).getFullYear().toString()
      };
    })
    .filter((tick, index, array) => index === 0 || tick.value !== array[index - 1].value);
}

function compressedTimelineValue(dateValue, focusStart, focusEnd) {
  const date = normaliseDate(dateValue);
  if (!date) return 0;

  const focusWidthMonths = monthsBetween(focusStart, focusEnd);
  if (date < focusStart) {
    return roundAxisValue(-monthsBetween(date, focusStart) / 12);
  }

  if (date > focusEnd) {
    return roundAxisValue(focusWidthMonths + (monthsBetween(focusEnd, date) / 12));
  }

  return roundAxisValue(monthsBetween(focusStart, date));
}

function monthsBetween(startDateValue, endDateValue) {
  const start = parseIsoDateLocal(startDateValue);
  const end = parseIsoDateLocal(endDateValue);
  if (!start || !end) return 0;
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375;
  return Math.max(0, (end.getTime() - start.getTime()) / msPerMonth);
}

function getMortgageMonthlyPayment(loan) {
  const details = loan.mortgageDetails || {};
  return Number(details.monthlyPayment || 0) + Number(details.plannedMonthlyOverpayment || 0);
}

function estimateRegularPaymentsToDate(loan, startDate, currentDate) {
  const monthlyPayment = getMortgageMonthlyPayment(loan);
  const elapsedMonths = getCompletedMonthCount(startDate, currentDate);
  if (monthlyPayment <= 0 || elapsedMonths <= 0) return 0;
  return roundCurrency(monthlyPayment * elapsedMonths);
}

function applyEstimatedInterestBetweenDates(balance, fromDate, toDate, loan) {
  const annualRate = Number(loan.mortgageDetails?.currentRate || 0);
  const monthlyRate = annualRate / 100 / 12;
  const elapsedMonths = getCompletedMonthCount(fromDate, toDate);
  let estimatedBalance = Number(balance || 0);

  for (let index = 0; index < elapsedMonths; index += 1) {
    estimatedBalance += estimatedBalance * monthlyRate;
  }

  return estimatedBalance;
}

function buildFutureMortgagePaymentSeries(loan, estimate, currentDate, currentBalance, totalPaidToDate) {
  const details = loan?.mortgageDetails || {};
  const monthlyPayment = Math.max(0, Number(details.monthlyPayment || 0) + Number(details.plannedMonthlyOverpayment || 0));
  const annualRate = Math.max(0, Number(details.currentRate || 0));
  const monthlyRate = annualRate / 100 / 12;
  const startingBalance = Math.max(0, Number(currentBalance || 0));
  const startingTotalPaid = Math.max(0, Number(totalPaidToDate || 0));
  const startDate = normaliseDate(currentDate) || today();

  if (startingBalance <= 0 || monthlyPayment <= 0) return [];

  const monthlyInterestNow = startingBalance * monthlyRate;
  if (monthlyRate > 0 && monthlyPayment <= monthlyInterestNow) {
    return [{
      date: addMonthsToDate(startDate, 12),
      label: formatChartDate(addMonthsToDate(startDate, 12)),
      dateLabel: `${formatChartDateLong(addMonthsToDate(startDate, 12))} · projection paused`,
      balance: roundCurrency(startingBalance + (monthlyInterestNow * 12)),
      totalPaidActual: null,
      totalPaidProjected: roundCurrency(startingTotalPaid),
      pointType: "projectionWarning"
    }];
  }

  const estimatedMonths = Number(estimate?.projectedPayoffMonths || 0);
  const remainingTermMonths = Number(details.remainingTermMonths || (Number(details.termYears || 0) * 12) || 0);
  const maxMonths = Math.min(720, Math.max(1, Math.ceil(estimatedMonths || remainingTermMonths || 360)));
  const points = [];
  let balance = startingBalance;
  let totalPaid = startingTotalPaid;

  for (let month = 1; month <= maxMonths && balance > 0.01; month += 1) {
    const interest = balance * monthlyRate;
    const payment = Math.min(monthlyPayment, balance + interest);
    balance = Math.max(0, balance + interest - payment);
    totalPaid += payment;

    const shouldShowPoint = month === 1 || month % 12 === 0 || balance <= 0.01 || month === maxMonths;
    if (shouldShowPoint) {
      const date = addMonthsToDate(startDate, month);
      points.push({
        date,
        label: formatChartDate(date),
        dateLabel: formatChartDateLong(date),
        balance: roundCurrency(balance),
        totalPaidActual: null,
        totalPaidProjected: roundCurrency(totalPaid),
        pointType: "projected"
      });
    }
  }

  return points;
}

function getCompletedMonthCount(startDateValue, endDateValue) {
  const start = parseIsoDateLocal(startDateValue);
  const end = parseIsoDateLocal(endDateValue);
  if (!start || !end || end <= start) return 0;

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function getFinalProjectedTotalPaid(chartData) {
  const projectedPoints = [...(chartData || [])]
    .filter(point => Number.isFinite(Number(point.totalPaidProjected)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (projectedPoints.length === 0) return null;
  return Number(projectedPoints[projectedPoints.length - 1].totalPaidProjected);
}

function MortgageChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const data = payload.find(item => item?.payload)?.payload || {};
  const visibleItems = payload.filter(item => Number.isFinite(Number(item.value)) && item.dataKey !== "linkedPaymentBalance");

  return (
    <div className="chart-tooltip loan-chart-tooltip">
      <strong>{data.dateLabel || label}</strong>
      {visibleItems.map(item => (
        <small key={item.dataKey}>
          {item.name}: {formatMoney(item.value)}
        </small>
      ))}
      {Number.isFinite(data.linkedPaymentAmount) && (
        <div className="linked-payment-tooltip-block">
          <small><strong>Linked payment:</strong> {data.linkedPaymentTitle || "Mortgage payment"}</small>
          <small>Payment made: {formatMoney(data.linkedPaymentAmount)}</small>
          <small>Estimated paid off: {formatMoney(data.linkedPaymentPrincipal || 0)}</small>
          {data.linkedPaymentInferred && <small className="muted">Capital part estimated from rate because no split was stored.</small>}
        </div>
      )}
    </div>
  );
}

function getLinkedLoanTransactions(transactions, loanId, startDate, endDate) {
  return (transactions || [])
    .filter(transaction => {
      const linkedId = transaction.linkedLoanId || transaction.loanId || transaction.relatedLoanId || transaction.mortgageLoanId;
      const date = normaliseDate(transaction.date);
      return linkedId === loanId && date && date >= startDate && date <= endDate;
    })
    .map(transaction => {
      const amount = Math.abs(Number(transaction.amount || 0));
      const explicitPrincipal = transaction.loanPrincipalAmount ?? transaction.principalAmount ?? transaction.mortgagePrincipalAmount ?? transaction.loanSplit?.principal;
      const explicitInterest = transaction.loanInterestAmount ?? transaction.interestAmount ?? transaction.mortgageInterestAmount ?? transaction.loanSplit?.interest;
      const principal = explicitPrincipal === undefined || explicitPrincipal === null || explicitPrincipal === ""
        ? null
        : Math.abs(Number(explicitPrincipal || 0));
      const interest = explicitInterest === undefined || explicitInterest === null || explicitInterest === ""
        ? null
        : Math.abs(Number(explicitInterest || 0));

      return {
        id: transaction.id,
        date: normaliseDate(transaction.date),
        title: transaction.title || transaction.note || "Linked mortgage payment",
        amount,
        principal,
        interest,
        principalWasInferred: principal === null
      };
    })
    .filter(payment => payment.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function estimateLinkedPrincipal(payment, currentEstimatedBalance, loan) {
  if (Number.isFinite(payment.principal) && payment.principal !== null) {
    return Math.max(0, Math.min(payment.principal, currentEstimatedBalance));
  }

  const annualRate = Number(loan.mortgageDetails?.currentRate || 0);
  const estimatedMonthlyInterest = currentEstimatedBalance * (annualRate / 100) / 12;
  return Math.max(0, Math.min(currentEstimatedBalance, Number(payment.amount || 0) - estimatedMonthlyInterest));
}

function upsertChartPoint(points, point) {
  const existingIndex = points.findIndex(item => item.date === point.date && item.pointType !== "linkedPayment");
  if (existingIndex >= 0) {
    points[existingIndex] = { ...points[existingIndex], ...point };
    return;
  }
  points.push(point);
}

function normaliseDate(value) {
  if (!value) return null;
  const date = parseIsoDateLocal(value);
  return date ? formatIsoDateLocal(date) : null;
}

function addMonthsToDate(dateValue, months) {
  return addMonthsToIsoDate(dateValue, Number(months || 0));
}

function formatChartDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function formatChartDateShort(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function formatChartDateLong(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function startOfMonth(dateValue) {
  const date = parseIsoDateLocal(dateValue);
  if (!date) return dateValue;
  return formatIsoDateLocal(new Date(date.getFullYear(), date.getMonth(), 1));
}

function startOfYear(dateValue) {
  const date = parseIsoDateLocal(dateValue);
  if (!date) return dateValue;
  return formatIsoDateLocal(new Date(date.getFullYear(), 0, 1));
}

function isSameDate(a, b) {
  return normaliseDate(a) === normaliseDate(b);
}

function roundAxisValue(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getTrackedInterest(events) {
  return (events || []).reduce((total, event) => {
    if (Number(event.interestAmount || 0) > 0) return total + Math.abs(Number(event.interestAmount || 0));
    if (["interest", "interestAdded", "monthlyInterest"].includes(event.type)) return total + Math.abs(Number(event.amount || 0));
    return total;
  }, 0);
}

function getRecentEvents(events) {
  return [...(events || [])]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 3);
}

function LoanModal({ loanForm, editingLoan, updateLoanForm, closeLoanModal, submitLoan }) {
  const selectedPlan = getStudentLoanPlan(loanForm.planType);

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submitLoan}>
        <div className="section-header">
          <h2>{editingLoan ? "Edit loan" : "Add loan"}</h2>
          <button type="button" className="icon-button" onClick={closeLoanModal}>×</button>
        </div>

        <div className="form-grid">
          <label>
            Loan type
            <select value={loanForm.type} onChange={event => updateLoanForm("type", event.target.value)}>
              <option value="studentLoan">Student loan</option>
              <option value="mortgage">Mortgage</option>
            </select>
          </label>

          <label>
            Loan name
            <input value={loanForm.name} onChange={event => updateLoanForm("name", event.target.value)} placeholder="Plan 2 Student Loan" />
          </label>

          <label>
            Original amount
            <input type="number" min="0" step="0.01" value={loanForm.originalAmount} onChange={event => updateLoanForm("originalAmount", event.target.value)} placeholder="45000" />
          </label>

          <label>
            Current balance
            <input type="number" min="0" step="0.01" value={loanForm.currentBalance} onChange={event => updateLoanForm("currentBalance", event.target.value)} placeholder="52000" />
          </label>

          <label>
            Balance date
            <input type="date" value={loanForm.balanceDate} onChange={event => updateLoanForm("balanceDate", event.target.value)} />
          </label>

          <label>
            Start date
            <input type="date" value={loanForm.startDate} onChange={event => updateLoanForm("startDate", event.target.value)} />
          </label>
        </div>

        {loanForm.type === "studentLoan" ? (
          <div className="form-section-card">
            <h3>Student loan settings</h3>
            <div className="form-grid">
              <label>
                Repayment plan
                <select value={loanForm.planType} onChange={event => updateLoanForm("planType", event.target.value)}>
                  {studentLoanPlanOptions.map(plan => <option key={plan.id} value={plan.id}>{plan.label}</option>)}
                </select>
                <small>{selectedPlan.label}: threshold {formatMoney(selectedPlan.annualThreshold, false)} per year.</small>
              </label>

              <label>
                Gross annual salary
                <input type="number" min="0" step="0.01" value={loanForm.grossAnnualSalary} onChange={event => updateLoanForm("grossAnnualSalary", event.target.value)} placeholder="32000" />
              </label>

              <label>
                Repayment start date
                <input type="date" value={loanForm.repaymentStartDate} onChange={event => updateLoanForm("repaymentStartDate", event.target.value)} />
              </label>

              <label>
                Pay frequency
                <select value={loanForm.payFrequency} onChange={event => updateLoanForm("payFrequency", event.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>

              <label>
                Employment type
                <select value={loanForm.employmentType} onChange={event => updateLoanForm("employmentType", event.target.value)}>
                  <option value="PAYE">PAYE</option>
                  <option value="self-employed">Self-employed</option>
                  <option value="overseas">Overseas</option>
                  <option value="not-working">Not working</option>
                </select>
              </label>

              <label>
                Salary growth %
                <input type="number" step="0.1" value={loanForm.salaryGrowthPercent} onChange={event => updateLoanForm("salaryGrowthPercent", event.target.value)} placeholder="3" />
              </label>

              <label>
                Manual interest override %
                <input type="number" min="0" step="0.01" value={loanForm.manualAnnualInterestRate} onChange={event => updateLoanForm("manualAnnualInterestRate", event.target.value)} placeholder={String(selectedPlan.annualInterestRate)} />
              </label>
            </div>
          </div>
        ) : (
          <div className="form-section-card">
            <h3>Mortgage settings</h3>
            <div className="form-grid">
              <label>
                Repayment type
                <select value={loanForm.repaymentType} onChange={event => updateLoanForm("repaymentType", event.target.value)}>
                  <option value="repayment">Repayment</option>
                  <option value="interestOnly">Interest-only</option>
                  <option value="partAndPart">Part-and-part</option>
                </select>
              </label>

              <label>
                Term length / years
                <input type="number" min="0" step="1" value={loanForm.termYears} onChange={event => updateLoanForm("termYears", event.target.value)} placeholder="25" />
              </label>

              <label>
                Remaining term / months
                <input type="number" min="0" step="1" value={loanForm.remainingTermMonths} onChange={event => updateLoanForm("remainingTermMonths", event.target.value)} placeholder="278" />
              </label>

              <label>
                Monthly payment
                <input type="number" min="0" step="0.01" value={loanForm.monthlyPayment} onChange={event => updateLoanForm("monthlyPayment", event.target.value)} placeholder="1150" />
              </label>

              <label>
                Payment day
                <input type="number" min="1" max="28" step="1" value={loanForm.paymentDay} onChange={event => updateLoanForm("paymentDay", event.target.value)} placeholder="1" />
              </label>

              <label>
                Interest type
                <select value={loanForm.interestType} onChange={event => updateLoanForm("interestType", event.target.value)}>
                  <option value="fixed">Fixed</option>
                  <option value="tracker">Tracker</option>
                  <option value="variable">Variable/SVR</option>
                  <option value="discounted">Discounted</option>
                  <option value="offset">Offset</option>
                </select>
              </label>

              <label>
                Current rate %
                <input type="number" min="0" step="0.01" value={loanForm.currentRate} onChange={event => updateLoanForm("currentRate", event.target.value)} placeholder="4.75" />
              </label>

              <label>
                Fixed/rate end date
                <input type="date" value={loanForm.fixedUntil} onChange={event => updateLoanForm("fixedUntil", event.target.value)} />
              </label>

              <label>
                Follow-on rate %
                <input type="number" min="0" step="0.01" value={loanForm.followOnRate} onChange={event => updateLoanForm("followOnRate", event.target.value)} placeholder="6.5" />
              </label>

              <label>
                Monthly overpayment
                <input type="number" min="0" step="0.01" value={loanForm.plannedMonthlyOverpayment} onChange={event => updateLoanForm("plannedMonthlyOverpayment", event.target.value)} placeholder="100" />
              </label>

              <label>
                Overpayment allowance %
                <input type="number" min="0" step="0.1" value={loanForm.overpaymentAllowancePercent} onChange={event => updateLoanForm("overpaymentAllowancePercent", event.target.value)} placeholder="10" />
              </label>

              <label>
                Property value
                <input type="number" min="0" step="0.01" value={loanForm.propertyValue} onChange={event => updateLoanForm("propertyValue", event.target.value)} placeholder="280000" />
              </label>

              <label className="checkbox-label full-width">
                <input
                  type="checkbox"
                  checked={loanForm.earlyRepaymentChargeApplies}
                  onChange={event => updateLoanForm("earlyRepaymentChargeApplies", event.target.checked)}
                />
                Early repayment charge may apply
              </label>
            </div>
          </div>
        )}

        <label className="full-width">
          Notes
          <textarea value={loanForm.notes} onChange={event => updateLoanForm("notes", event.target.value)} placeholder="Anything useful from the lender/SLC statement." />
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={closeLoanModal}>Cancel</button>
          <button className="primary-button">{editingLoan ? "Save loan" : "Add loan"}</button>
        </div>
      </form>
    </div>
  );
}
