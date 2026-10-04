import { formatMoney } from "../../utils/money.js";

export default function MoneyLeftCard({ value, label = "Money left this month", description = "", negativeLabel = "Overspent by", onClick = null }) {
  const isNegative = value < 0;

  return (
    // Click anywhere with a mouse; the label is the keyboard/screen-reader button.
    <section
      className={`card money-left-card ${isNegative ? "danger" : ""} ${onClick ? "clickable-card" : ""}`}
      onClick={onClick || undefined}
    >
      <div>
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
        <h2>{isNegative ? `${negativeLabel} ${formatMoney(Math.abs(value), false)}` : formatMoney(value, false)}</h2>
      </div>
      {description ? <p>{description}</p> : null}
    </section>
  );
}
