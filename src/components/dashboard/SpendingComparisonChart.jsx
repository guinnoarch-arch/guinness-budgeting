import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "../../utils/money.js";

export default function SpendingComparisonChart({ summary }) {
  const data = summary.spendingTrend || [
    { name: "2 months ago", spending: summary.twoMonthsAgoExpenses || 0 },
    { name: "Last month", spending: summary.previousExpenses || 0 },
    { name: "This month", spending: summary.expenses || 0 }
  ];

  return (
    <section className="card chart-card">
      <h3>{summary.comparisonChartTitle || "Spending vs previous months"}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip formatter={(value) => formatMoney(value)} />
          <Line type="monotone" dataKey="spending" name={summary.chartMetricName || "Spending"} stroke="#0f766e" strokeWidth={3} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
