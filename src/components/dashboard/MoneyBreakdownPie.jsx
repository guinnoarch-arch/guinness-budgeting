import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatMoney } from "../../utils/money.js";

const MONEY_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6"];
const GOAL_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#f59e0b", "#ef4444", "#14b8a6", "#84cc16"];
const labels = ["Expenses", "Savings", "Money left", "Carry-forward"];

export default function MoneyBreakdownPie({ summary }) {
  const isSavingsView = summary.isSavingsView;
  const data = isSavingsView
    ? (summary.savingsGoalBreakdown || [])
    : [
        { name: "Expenses", value: Math.max(summary.expenses, 0) },
        { name: "Savings", value: Math.max(summary.savingsTransfers, 0) },
        { name: "Money left", value: Math.max(summary.moneyLeft, 0) },
        { name: "Carry-forward", value: Math.max(summary.carryForward, 0) }
      ].filter(item => item.value > 0);

  const renderCustomLabel = (entry) => `${entry.name}: ${formatMoney(entry.value)}`;

  return (
    <section className="card chart-card">
      <h3>{isSavingsView ? "Where savings is saved for" : "Where the money has gone"}</h3>
      {data.length === 0 ? (
        <p className="muted">No {isSavingsView ? "savings goal" : "money breakdown"} data for this month.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              outerRadius={85}
              label={renderCustomLabel}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={isSavingsView ? GOAL_COLORS[index % GOAL_COLORS.length] : MONEY_COLORS[labels.indexOf(entry.name)]}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [formatMoney(value), name]} />
            <Legend formatter={(value) => {
              const item = data.find(slice => slice.name === value);
              return item ? `${value}: ${formatMoney(item.value)}` : value;
            }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
