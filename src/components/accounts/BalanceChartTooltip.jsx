// Hover tooltip for the account balance chart.
import { formatMoney } from "../../utils/money.js";

export function BalanceChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const visiblePayload = payload
    .filter(item => item.value !== null && item.value !== undefined)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

  return (
    <div className="chart-tooltip-card account-balance-tooltip">
      <strong>{label}</strong>
      {visiblePayload.map(item => (
        <p key={item.dataKey}>
          <span style={{ color: item.color }}>{item.name}</span>
          <strong>{formatMoney(item.value)}</strong>
        </p>
      ))}
    </div>
  );
}
