import { getProjectedDateFromMonths } from "../../utils/loanCalculations.js";
import { formatMoney } from "../../utils/money.js";
import { HouseContributionTable, InfoMetric, LoanToValueMetric, MortgageOverpaymentMiniCalculator } from "./HouseSummaryParts.jsx";
import { MortgageLoanDetails } from "./MortgageLoanDetails.jsx";
import { buildHouseMortgageAppData } from "../../utils/houseMortgage.js";

export function HouseMortgagePanel({ house, summary, mortgageLoan, mortgageEstimate, mortgageEvents, appData, linkedAccount }) {
  const mortgage = house.mortgage || {};
  const details = mortgageLoan.mortgageDetails || {};
  const mortgageAppData = buildHouseMortgageAppData(appData, house, mortgageLoan);
  const mortgageContributions = summary.contributions.filter(item => ["mortgagePayment", "mortgageOverpayment"].includes(item.type));
  const externalMortgageTotal = mortgageContributions
    .filter(item => item.sourceType === "external")
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const linkedMortgageTotal = mortgageContributions
    .filter(item => item.sourceType === "linkedTransaction")
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const projectedPayoffDate = mortgageEstimate.projectedPayoffMonths
    ? getProjectedDateFromMonths(mortgageEstimate.projectedPayoffMonths, mortgageLoan.balanceDate)
    : null;

  return (
    <div className="house-mortgage-panel stack">
      <div className="section-header compact-header">
        <div>
          <h4>Mortgage</h4>
        </div>
      </div>

      <div className="loan-detail-grid">
        <InfoMetric label="Current mortgage balance" value={formatMoney(mortgageLoan.currentBalance)} />
        <InfoMetric label="Original borrowed" value={formatMoney(mortgageLoan.originalAmount)} />
        <InfoMetric label="Total paid off" value={formatMoney(Math.max(0, Number(mortgageLoan.originalAmount || 0) - Number(mortgageLoan.currentBalance || 0)))} />
        <LoanToValueMetric balance={mortgageLoan.currentBalance} value={summary.propertyValue} purchasePrice={summary.purchasePrice} />
        <InfoMetric label="Monthly repayment" value={formatMoney(details.monthlyPayment || 0)} />
        <InfoMetric label="Interest rate" value={`${Number(details.currentRate || 0).toFixed(2)}% ${details.interestType || ""}`} />
        <InfoMetric label="Fixed/rate ends" value={details.fixedUntil || "Not set"} />
        <InfoMetric label="Remaining term" value={details.remainingTermMonths ? `${details.remainingTermMonths} months` : `${details.termYears || 0} years`} />
        <InfoMetric label="Projected payoff" value={projectedPayoffDate || "Not enough data"} />
        <InfoMetric label="Linked account" value={linkedAccount?.name || "None selected"} />
      </div>

      <div className="loan-detail-grid">
        <InfoMetric label="Mortgage payments" value={formatMoney(summary.mortgagePaymentTotal)} />
        <InfoMetric label="Overpayments" value={formatMoney(summary.mortgageOverpaymentTotal)} />
        <InfoMetric label="Linked app payments" value={formatMoney(linkedMortgageTotal)} />
        <InfoMetric label="External mortgage payments" value={formatMoney(externalMortgageTotal)} />
      </div>

      <MortgageLoanDetails
        loan={mortgageLoan}
        estimate={mortgageEstimate}
        events={mortgageEvents}
        transactions={mortgageAppData.transactions || []}
        appData={mortgageAppData}
      />

      <MortgageOverpaymentMiniCalculator house={house} />

      <details className="loan-extra-details-card">
        <summary>Mortgage detail fields</summary>
        <div className="profile-meta-grid">
          <p><span>Start date</span><strong>{mortgageLoan.startDate || "Not set"}</strong></p>
          <p><span>Repayment type</span><strong>{details.repaymentType || "repayment"}</strong></p>
          <p><span>Payment day</span><strong>{details.paymentDay || "Not set"}</strong></p>
          <p><span>Follow-on rate</span><strong>{Number(details.followOnRate || 0).toFixed(2)}%</strong></p>
          <p><span>Planned monthly overpayment</span><strong>{formatMoney(details.plannedMonthlyOverpayment || 0)}</strong></p>
          <p><span>Overpayment allowance</span><strong>{Number(details.overpaymentAllowancePercent || 0).toFixed(1)}%</strong></p>
          <p><span>Early repayment charge</span><strong>{details.earlyRepaymentChargeApplies ? "May apply" : "Not marked"}</strong></p>
          <p><span>Notes</span><strong>{mortgage.notes || mortgageLoan.notes || "None"}</strong></p>
        </div>
      </details>

      <details className="loan-extra-details-card">
        <summary>Mortgage payments and overpayments</summary>
        <HouseContributionTable contributions={mortgageContributions} people={summary.people} canEdit={false} />
      </details>
    </div>
  );
}
