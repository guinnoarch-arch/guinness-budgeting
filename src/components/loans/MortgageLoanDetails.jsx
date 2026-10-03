import { Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { calculateLoanEstimate, getProjectedDateFromMonths } from "../../utils/loanCalculations.js";
import { formatMoney } from "../../utils/money.js";
import { getLoanTimelineEvents, getMortgageOverpaymentSummary } from "../../utils/loanLinking.js";
import { LoanEventList } from "./LoanEventList.jsx";
import { getRecentEvents, getTrackedInterest } from "./loanDisplay.js";
import { buildMortgageChartData, getFinalProjectedTotalPaid, getMortgageProgressSnapshot, roundAxisValue } from "../../utils/mortgageChart.js";
import ExpandableChart from "../common/ExpandableChart.jsx";
import { AXIS_TICK } from "../../utils/chartTheme.js";

export function MortgageLoanDetails({ loan, events, transactions, appData }) {
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
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card positive-card-soft">
          <small>Total paid off</small>
          <strong>{formatMoney(totalPaidOff)}</strong>
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
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Final finish date</small>
          <strong>{payoffDate || "Not enough data"}</strong>
        </div>
      </div>

      {hasProjection ? (
        <div className="loan-chart-card mortgage-balance-chart">
          <div className="section-header compact-header">
            <div>
              <h4>Mortgage balance projection</h4>
            </div>
          </div>
          <ExpandableChart title={"Mortgage balance projection"} height={260}>
            <LineChart data={chartData}>
              <XAxis
                tick={AXIS_TICK}
                dataKey="timelineX"
                type="number"
                domain={chartModel.domain}
                ticks={chartModel.ticks.map(tick => tick.value)}
                tickFormatter={value => chartModel.tickLabelLookup[String(roundAxisValue(value))] || ""}
                interval={0}
              />
              <YAxis tick={AXIS_TICK} tickFormatter={value => `£${Math.round(value / 1000)}k`} />
              <Tooltip content={<MortgageChartTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="balance" name="Amount owed" stroke="var(--primary)" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="totalPaidActual" name="Total paid to date" stroke="var(--green)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
              <Line type="monotone" dataKey="totalPaidProjected" name="Projected total paid" stroke="var(--green)" strokeWidth={3} strokeDasharray="7 7" strokeOpacity={0.45} dot={false} connectNulls={false} />
              {chartData.some(point => Number.isFinite(point.linkedPaymentBalance)) && (
                <Line type="linear" dataKey="linkedPaymentBalance" name="Linked payment" stroke="var(--orange)" strokeWidth={0} dot={{ r: 5 }} activeDot={{ r: 7 }} connectNulls={false} />
              )}
            </LineChart>
          </ExpandableChart>
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
          </div>
          <div className="sub-card loan-detail-card">
            <small>Total interest gained/added</small>
            <strong>{trackedInterest > 0 ? formatMoney(trackedInterest) : "Not tracked yet"}</strong>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Total projected amount paid at end</small>
            <strong>{totalProjectedPaidAtEnd !== null ? formatMoney(totalProjectedPaidAtEnd) : "Not enough data"}</strong>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Total projected interest at end</small>
            <strong>{totalProjectedInterestAtEnd !== null ? formatMoney(totalProjectedInterestAtEnd) : formatMoney(liveEstimate.projectedTotalInterest || 0)}</strong>
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
