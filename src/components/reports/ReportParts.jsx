// Cards, empty states and the chart tooltip used on the Reports page.
import { formatMoney } from "../../utils/money.js";

export function ReportCard({ label, value, detail, tone = "" }) {
  return (
    <section className={`card summary-card report-summary-card ${tone}`}>
      <p className="eyebrow">{label}</p>
      <h3>{value}</h3>
      {detail && <p className="muted-text">{detail}</p>}
    </section>
  );
}

export function EmptyReportBlock({ children = "No data for this report section yet." }) {
  return <p className="muted-text empty-report-block">{children}</p>;
}

export function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip-card">
      <strong>{label}</strong>
      {payload.map(item => (
        <p key={item.dataKey}>
          <span>{item.name}</span>
          <strong>{formatMoney(item.value)}</strong>
        </p>
      ))}
    </div>
  );
}
