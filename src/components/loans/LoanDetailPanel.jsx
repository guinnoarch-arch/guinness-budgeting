import { getStudentLoanPlan } from "../../data/studentLoanPlans.js";
import { calculateLoanEstimate } from "../../utils/loanCalculations.js";
import { formatMoney } from "../../utils/money.js";
import { getLoanTimelineEvents, getLoanValidationWarnings } from "../../utils/loanLinking.js";
import { MortgageLoanDetails } from "./MortgageLoanDetails.jsx";
import { getRecentEvents } from "./loanDisplay.js";
import { LoanEventList } from "./LoanEventList.jsx";

export function LoanDetailPanel({ loan, events, transactions, appData, onEdit, onArchive, onBalanceUpdate, onClose }) {
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
      {isMortgage && <MortgageLoanDetails loan={loan} events={events} transactions={transactions} appData={appData} />}
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
        </div>
        <div className="sub-card loan-detail-card">
          <small>Plan</small>
          <strong>{plan.label}</strong>
          <p className="muted">Repays {(plan.repaymentRate * 100).toFixed(0)}% above {formatMoney(plan.annualThreshold, false)} annual threshold.</p>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Estimated monthly repayment</small>
          <strong>{formatMoney(estimate.monthlyRepayment)}</strong>
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
          </div>
          <div className="sub-card loan-detail-card">
            <small>Interest rate used</small>
            <strong>{estimate.annualInterestRate.toFixed(2)}%</strong>
            <p className="muted">{plan.interestDescription || "Current estimate."}</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Monthly interest</small>
            <strong>{formatMoney(estimate.monthlyInterest)}</strong>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Balance movement</small>
            <strong className={estimate.monthlyCapitalPaid > 0 ? "positive-text" : "danger-text"}>{formatMoney(estimate.monthlyCapitalPaid)}</strong>
          </div>
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
