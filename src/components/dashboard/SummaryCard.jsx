import { formatMoney } from "../../utils/money.js";

export default function SummaryCard({ label, value, change, tone = "neutral" }) {
  const changeText = change === null || change === undefined
    ? "No previous data"
    : `${change >= 0 ? "+" : ""}${change.toFixed(0)}% vs previous month`;

  return (
    <section className={`card summary-card ${tone}`}>
      <p className="eyebrow">{label}</p>
      <h3>{formatMoney(value, false)}</h3>
      <span className={change >= 0 ? "positive-text" : "negative-text"}>{changeText}</span>
    </section>
  );
}
