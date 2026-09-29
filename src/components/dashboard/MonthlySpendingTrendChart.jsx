import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import useIsSmallScreen from "../../hooks/useIsSmallScreen.js";
import { formatMoney } from "../../utils/money.js";
import ExpandableChart from "../common/ExpandableChart.jsx";

const MONTH_LINE_COLOURS = {
  twoMonthsAgo: "#2563eb",
  previous: "#f59e0b",
  current: "#0f766e"
};

export default function MonthlySpendingTrendChart({ comparison }) {
  const isSmallScreen = useIsSmallScreen();
  const chartData = comparison?.data || [];
  const labels = comparison?.labels || {
    current: "This month",
    previous: "Previous month",
    twoMonthsAgo: "Two months ago"
  };

  return (
    <section className="card chart-card wide-chart-card monthly-spending-trend-card">
      <div className="section-header compact-header chart-title-with-toggle">
        <div>
          <h3>{comparison?.title || "Spending through the month"}</h3>
        </div>
      </div>

      <ExpandableChart title={comparison?.title || "Spending through the month"} height={300}>
        <LineChart data={chartData} margin={{ top: 10, right: 24, left: 6, bottom: isSmallScreen ? 28 : 18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          {/* Only pass the phone-specific settings on small screens. Passing
              them as `undefined` on larger screens overrides the chart
              library's own defaults (e.g. the axis height), which left the
              whole chart blank on a computer. */}
          <XAxis
            dataKey="day"
            tick={{ fill: "#4b5563" }}
            {...(isSmallScreen
              ? { interval: 4, angle: -40, textAnchor: "end", height: 56, tickMargin: 8 }
              : { label: { value: "Day of month", position: "insideBottom", offset: -4, fill: "#4b5563" } })}
          />
          <YAxis tick={{ fill: "#4b5563" }} tickFormatter={(value) => formatMoney(value, false)} />
          <Tooltip
            labelFormatter={(day) => `Day ${day}`}
            formatter={(value, name) => [formatMoney(value), name]}
          />
          <Legend wrapperStyle={{ paddingTop: isSmallScreen ? 0 : 12 }} />
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
      </ExpandableChart>
    </section>
  );
}
