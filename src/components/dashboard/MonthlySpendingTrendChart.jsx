import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "../../utils/money.js";

const MONTH_LINE_COLOURS = {
  twoMonthsAgo: "#2563eb",
  previous: "#f59e0b",
  current: "#0f766e"
};

export default function MonthlySpendingTrendChart({ comparison }) {
  const chartData = comparison?.data || [];
  const labels = comparison?.labels || {
    current: "This month",
    previous: "Previous month",
    twoMonthsAgo: "Two months ago"
  };

  return (
    <section className="card chart-card wide-chart-card monthly-spending-trend-card">
      <div className="section-header compact-header">
        <div>
          <h3>{comparison?.title || "Spending through the month"}</h3>
          <p className="muted-text">
            {comparison?.description || "Cumulative spending by day of the month compared with the last two months."}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 10, right: 24, left: 6, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="day"
            tick={{ fill: "#4b5563" }}
            label={{ value: "Day of month", position: "insideBottom", offset: -4, fill: "#4b5563" }}
          />
          <YAxis tick={{ fill: "#4b5563" }} tickFormatter={(value) => formatMoney(value, false)} />
          <Tooltip
            labelFormatter={(day) => `Day ${day}`}
            formatter={(value, name) => [formatMoney(value), name]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="twoMonthsAgo"
            name={labels.twoMonthsAgo}
            stroke={MONTH_LINE_COLOURS.twoMonthsAgo}
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="previous"
            name={labels.previous}
            stroke={MONTH_LINE_COLOURS.previous}
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="current"
            name={labels.current}
            stroke={MONTH_LINE_COLOURS.current}
            strokeWidth={3.5}
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
