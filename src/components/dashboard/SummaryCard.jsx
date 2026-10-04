import { formatMoney } from "../../utils/money.js";

export default function SummaryCard({ label, value, change, tone = "neutral", detail = "", afterValue = null, onClick = null, higherIsBetter = true }) {
  const hasComparison = change !== null && change !== undefined && Number.isFinite(change);
  const percentageText = hasComparison ? `${change >= 0 ? "+" : ""}${change.toFixed(0)}%` : "";
  // For spending, going down is the good direction.
  const isImprovement = hasComparison && (higherIsBetter ? change >= 0 : change <= 0);

  return (
    <section
      className={`card summary-card ${tone} ${onClick ? "clickable-card" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={event => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <p className="eyebrow">{label}</p>
      <div className="summary-card-value-row">
        <h3>{formatMoney(value, false)}</h3>
        {afterValue}
      </div>
      {detail ? (
        <span className="muted-text">{detail}</span>
      ) : hasComparison ? (
        <span className={isImprovement ? "positive-text" : "negative-text"} title={`${percentageText} vs previous month`}>
          <span className="summary-change-short">{percentageText}</span>
          <span className="summary-change-full"> vs previous month</span>
        </span>
      ) : (
        <span className="muted-text">No data for the previous month</span>
      )}
    </section>
  );
}
