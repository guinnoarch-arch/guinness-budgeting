import { useState } from "react";
import { calculateLoanToValue } from "../../utils/houseTracking.js";
import { formatMoney } from "../../utils/money.js";
import { formatContributionType, formatLoanToValue, formatSourceType } from "./loanDisplay.js";

export function HouseBalanceEstimate({ summary }) {
  if (!summary.people.length || summary.totalContributed <= 0) return null;
  const manualSplits = new Map(summary.splits.map(split => [split.personId, Number(split.percentage || 0)]));
  const hasManual = summary.manualSplitValid && manualSplits.size > 0;
  const equalPercent = summary.people.length > 0 ? 100 / summary.people.length : 0;
  const rows = summary.people.map(person => {
    const actual = summary.byPerson.find(item => item.personId === person.id)?.amount || 0;
    const expectedPercent = hasManual ? manualSplits.get(person.id) || 0 : equalPercent;
    const expected = summary.totalContributed * (expectedPercent / 100);
    return { person, expected, actual, difference: actual - expected };
  });
  return (
    <div className="house-balance-estimate">
      <h5>Contribution balance</h5>
      <div className="loan-event-table-wrap">
        <table className="loan-event-table">
          <thead><tr><th>Person</th><th>Expected</th><th>Actual</th><th>Difference</th></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.person.id}>
                <td>{row.person.name}</td>
                <td>{formatMoney(row.expected)}</td>
                <td>{formatMoney(row.actual)}</td>
                <td className={row.difference >= 0 ? "positive-text" : "negative-text"}>{row.difference >= 0 ? "Ahead " : "Behind "}{formatMoney(Math.abs(row.difference))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MortgageOverpaymentMiniCalculator({ house }) {
  const mortgage = house.mortgage || {};
  const balance = Number(mortgage.currentBalance || 0);
  const rate = Number(mortgage.interestRate || 0) / 100 / 12;
  const basePayment = Number(mortgage.monthlyPayment || 0);
  const termMonths = Math.max(1, Number(mortgage.termYears || 0) * 12);
  const [extra, setExtra] = useState("");
  const extraPayment = Number(extra || 0);

  function simulate(paymentExtra = 0) {
    let remaining = balance;
    let months = 0;
    let interest = 0;
    const payment = Math.max(0, basePayment + paymentExtra);
    if (!remaining || !payment) return { months: termMonths, interest: 0 };
    while (remaining > 0 && months < 600) {
      const monthlyInterest = remaining * rate;
      interest += monthlyInterest;
      remaining = Math.max(0, remaining + monthlyInterest - payment);
      months += 1;
      if (payment <= monthlyInterest && rate > 0) break;
    }
    return { months, interest };
  }

  const base = simulate(0);
  const withExtra = simulate(extraPayment);
  if (!balance || !basePayment) return null;
  return (
    <div className="mortgage-mini-calculator">
      <h5>Overpayment estimate</h5>
      <label>Extra monthly overpayment<input type="number" min="0" step="0.01" value={extra} onChange={event => setExtra(event.target.value)} /></label>
      <p className="muted-text">Fixed-rate estimate only. Real lender calculations can differ.</p>
      <div className="profile-meta-grid">
        <p><span>Interest saved</span><strong>{formatMoney(Math.max(0, base.interest - withExtra.interest))}</strong></p>
        <p><span>Time saved</span><strong>{Math.max(0, base.months - withExtra.months)} month(s)</strong></p>
        <p><span>Estimated payoff</span><strong>{withExtra.months} month(s)</strong></p>
      </div>
    </div>
  );
}

export function InfoMetric({ label, value, detail = null }) {
  return (
    <div className="loan-detail-card sub-card">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <small className="loan-detail-note">{detail}</small>}
    </div>
  );
}

// Loan to value: the mortgage still owed today as a percentage of the
// house's current value, with the working shown, plus the same against the
// purchase price when that's recorded and different.
export function LoanToValueMetric({ balance, value, purchasePrice }) {
  const ltv = calculateLoanToValue(balance, value);
  const purchaseLtv = calculateLoanToValue(balance, purchasePrice);
  const showPurchase = purchaseLtv !== null && Number(purchasePrice) !== Number(value);
  return (
    <InfoMetric
      label="Loan to value (LTV)"
      value={formatLoanToValue(ltv)}
      detail={ltv === null
        ? "Enter the house value to work this out."
        : `${formatMoney(balance)} owed ÷ ${formatMoney(value)} value${showPurchase ? ` · ${formatLoanToValue(purchaseLtv)} of the ${formatMoney(purchasePrice)} purchase price` : ""}`}
    />
  );
}

export function ContributionSplitList({ summary }) {
  if (summary.byPerson.length === 0) return <p className="muted-text">No contributions recorded yet.</p>;
  return (
    <div className="house-split-list">
      {summary.byPerson.map(person => (
        <div key={person.key} className="house-split-row">
          <span>{person.name}</span>
          <strong>{formatMoney(person.amount)} · {person.percentage.toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  );
}

export function HouseContributionTable({ contributions, people, onEditContribution, onDeleteContribution, canEdit = true }) {
  if (contributions.length === 0) return <p className="muted-text">No house contributions yet.</p>;
  return (
    <div className="loan-event-table-wrap">
      <table className="loan-event-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Person</th>
            <th>Type</th>
            <th>Source</th>
            <th>Amount</th>
            <th>Notes</th>
            {canEdit && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {[...contributions].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(item => {
            const person = people.find(candidate => candidate.id === item.personId);
            return (
              <tr key={item.id}>
                <td>{item.date}</td>
                <td>{person?.name || item.personName || "Unassigned"}</td>
                <td>{formatContributionType(item.type)}</td>
                <td>{formatSourceType(item.sourceType)}</td>
                <td>{formatMoney(item.amount)}</td>
                <td>{item.notes || "—"}</td>
                {canEdit && (
                  <td>
                    <div className="row-actions">
                      <button type="button" className="secondary-button small" onClick={() => onEditContribution(item)}>Edit</button>
                      <button type="button" className="danger-button small" onClick={() => onDeleteContribution(item)}>Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
