import { formatMoney } from "../../utils/money.js";

export default function MoneyLeftCard({ value, label = "Money left this month", description = "", negativeLabel = "Overspent by" }) {
  const isNegative = value < 0;

  return (
    <section className={`card money-left-card ${isNegative ? "danger" : ""}`}>
      <div>
        <p className="eyebrow">{label}</p>
        <h2>{isNegative ? `${negativeLabel} ${formatMoney(Math.abs(value), false)}` : formatMoney(value, false)}</h2>
      </div>
      {description ? <p>{description}</p> : null}
    </section>
  );
}
