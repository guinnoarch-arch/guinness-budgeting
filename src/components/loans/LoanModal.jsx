import { ErrorSummary, FieldError, RequiredMark } from "../common/FormFeedback.jsx";
import { studentLoanPlanOptions, getStudentLoanPlan } from "../../data/studentLoanPlans.js";
import { formatMoney } from "../../utils/money.js";

export function LoanModal({ loanForm, editingLoan, updateLoanForm, closeLoanModal, submitLoan, validation }) {
  const selectedPlan = getStudentLoanPlan(loanForm.planType);

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submitLoan} noValidate>
        <div className="section-header">
          <h2>{editingLoan ? "Edit loan" : "Add loan"}</h2>
          <button type="button" className="icon-button" onClick={closeLoanModal} aria-label="Close">×</button>
        </div>
        <ErrorSummary errors={validation.errors} getFieldId={validation.getFieldId} />

        <div className="form-grid">
          <label>
            Loan type
            <select value={loanForm.type} onChange={event => updateLoanForm("type", event.target.value)}>
              <option value="studentLoan">Student loan</option>
              <option value="mortgage">Mortgage</option>
            </select>
          </label>

          <label>
            <span>Loan name<RequiredMark /></span>
            <input {...validation.fieldProps("name")} aria-required="true" value={loanForm.name} onChange={event => updateLoanForm("name", event.target.value)} placeholder="Plan 2 Student Loan" />
            <FieldError fieldId={validation.getFieldId("name")} message={validation.errors.name} />
          </label>

          <label>
            Original amount
            <input type="number" min="0" step="0.01" value={loanForm.originalAmount} onChange={event => updateLoanForm("originalAmount", event.target.value)} placeholder="45000" />
          </label>

          <label>
            Current balance
            <input
              {...validation.fieldProps("currentBalance")}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={loanForm.currentBalance}
              onChange={event => updateLoanForm("currentBalance", event.target.value)}
              onBlur={() => validation.validateFieldOnBlur("currentBalance", loanForm)}
              placeholder="52000"
            />
            <FieldError fieldId={validation.getFieldId("currentBalance")} message={validation.errors.currentBalance} />
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
