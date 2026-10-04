import { formatMoney } from "../../utils/money.js";

export default function SummaryCard({ label, value, change, tone = "neutral", detail = "", afterValue = null, onClick = null, higherIsBetter = true }) {
  const hasComparison = change !== null && change !== undefined && Number.isFinite(change);
  const percentageText = hasComparison ? `${change >= 0 ? "+" : ""}${change.toFixed(0)}%` : "";
  // For spending, going down is the good direction.
  const isImprovement = hasComparison && (higherIsBetter ? change >= 0 : change <= 0);

  return (
    // The whole card is clickable with a mouse; for keyboard and screen
    // readers the label is the button, so controls inside the card (like the
    // "Include in charts" tick box) aren't nested inside another control.
    <section
      className={`card summary-card ${tone} ${onClick ? "clickable-card" : ""}`}
      onClick={onClick || undefined}
    >
      <p className="eyebrow">
        {onClick ? (
          <button
            type="button"
            className="card-label-button"
            aria-label={`${label}: show details`}
            onClick={event => {
              event.stopPropagation();
              onClick();
            }}
          >
            {label}
          </button>
        ) : label}
      </p>
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
