import { formatMoney } from "../../utils/money.js";

export default function MoneyLeftCard({ value, label = "Money left this month", description = "", negativeLabel = "Overspent by", onClick = null }) {
  const isNegative = value < 0;

  return (
    <section
      className={`card money-left-card ${isNegative ? "danger" : ""} ${onClick ? "clickable-card" : ""}`}
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
      <div>
        <p className="eyebrow">{label}</p>
        <h2>{isNegative ? `${negativeLabel} ${formatMoney(Math.abs(value), false)}` : formatMoney(value, false)}</h2>
      </div>
      {description ? <p>{description}</p> : null}
    </section>
  );
}
