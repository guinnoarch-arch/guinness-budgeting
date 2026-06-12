import { formatMoney } from "../../utils/money.js";

export default function SummaryCard({ label, value, change, tone = "neutral", detail = "", afterValue = null }) {
  const percentageText = change === null || change === undefined
    ? "No previous data"
    : `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`;
  const changeText = change === null || change === undefined
    ? percentageText
    : `${percentageText} vs previous month`;

  return (
    <section className={`card summary-card ${tone}`}>
      <p className="eyebrow">{label}</p>
      <div className="summary-card-value-row">
        <h3>{formatMoney(value, false)}</h3>
        {afterValue}
      </div>
      {detail ? (
        <span className="muted-text">{detail}</span>
      ) : (
        <span className={change >= 0 ? "positive-text" : "negative-text"} title={changeText}>
          <span className="summary-change-short">{percentageText}</span>
          <span className="summary-change-full"> vs previous month</span>
        </span>
      )}
    </section>
  );
}
