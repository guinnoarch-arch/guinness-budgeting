import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useIsSmallScreen from "../../hooks/useIsSmallScreen.js";
import { smallMonthXAxisProps } from "../../utils/chartLabels.js";
import { formatMoney } from "../../utils/money.js";

export default function SpendingComparisonChart({ summary }) {
  const isSmallScreen = useIsSmallScreen();
  const data = summary.spendingTrend || [
    { name: "2 months ago", spending: summary.twoMonthsAgoExpenses || 0 },
    { name: "Last month", spending: summary.previousExpenses || 0 },
    { name: "This month", spending: summary.expenses || 0 }
  ];
  const metricName = summary.chartMetricName || "Spending";

  return (
    <section className="card chart-card">
      <div className="section-header compact-header chart-title-with-toggle">
        <div>
          <h3>{summary.comparisonChartTitle || `${metricName} - last 6 months`}</h3>
          <p className="muted-text chart-subtitle">Monthly {metricName.toLowerCase()} total for the selected account view.</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: isSmallScreen ? 28 : 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            interval={0}
            minTickGap={4}
            {...(isSmallScreen ? smallMonthXAxisProps() : {})}
          />
          <YAxis tickFormatter={(value) => formatMoney(value, false)} />
          <Tooltip formatter={(value) => formatMoney(value)} />
          <Line type="monotone" dataKey="spending" name={metricName} stroke="#0f766e" strokeWidth={3} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
