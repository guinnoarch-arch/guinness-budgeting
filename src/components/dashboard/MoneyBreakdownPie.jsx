import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "../../utils/money.js";

const MONEY_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#6366f1",
  "#14b8a6",
  "#84cc16",
  "#a855f7",
  "#ec4899",
  "#0ea5e9",
  "#64748b"
];
const GOAL_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#f59e0b", "#ef4444", "#14b8a6", "#84cc16"];
const RADIAN = Math.PI / 180;

function compactMoney(value) {
  return formatMoney(value).replace(/\.00$/, "");
}

function makeBudgetLabel(item) {
  const spent = Number(item.spent || 0);
  const limit = Number(item.limit || 0);
  if (limit > 0) return `${item.name} - ${compactMoney(spent)}/${compactMoney(limit)}`;
  return `${item.name} - ${compactMoney(spent)}`;
}

function buildBudgetBreakdownData(summary) {
  const budgetSlices = (summary.budgetBreakdown || [])
    .filter(item => Number(item.spent || 0) > 0 || Number(item.limit || 0) > 0)
    .map(item => {
      const spent = Number(item.spent || 0);
      const limit = Number(item.limit || 0);
      return {
        name: makeBudgetLabel(item),
        value: Math.max(spent, 0),
        kind: limit > 0 ? "budget" : "no-limit-budget",
        budgetName: item.name,
        spent,
        limit,
        remaining: Number(item.remaining || 0),
        accountName: item.accountName || ""
      };
    })
    .filter(item => item.value > 0);

  const coveredBudgetedSpending = budgetSlices
    .filter(item => item.limit > 0)
    .reduce((total, item) => total + item.value, 0);

  const unassignedBudgetCountedSpending = Math.max(
    Number(summary.budgetCountedSpending || 0) - coveredBudgetedSpending,
    0
  );

  return [
    ...budgetSlices,
    ...(unassignedBudgetCountedSpending > 0.009
      ? [{
          name: `Other budget spending - ${compactMoney(unassignedBudgetCountedSpending)}`,
          value: unassignedBudgetCountedSpending,
          kind: "other-budget"
        }]
      : [])
  ];
}

function buildMoneyData(summary, includeExcludedSpending) {
  return [
    ...buildBudgetBreakdownData(summary),
    ...(includeExcludedSpending
      ? [{
          name: `Excluded spending - ${compactMoney(summary.excludedSpending || 0)}`,
          value: Math.max(summary.excludedSpending || 0, 0),
          kind: "excluded"
        }]
      : []),
    { name: `Savings - ${compactMoney(summary.savingsTransfers || 0)}`, value: Math.max(summary.savingsTransfers, 0), kind: "savings" },
    { name: `Budget left - ${compactMoney(summary.moneyLeft || 0)}`, value: Math.max(summary.moneyLeft, 0), kind: "budget-left" },
    { name: `Carry-forward - ${compactMoney(summary.carryForward || 0)}`, value: Math.max(summary.carryForward, 0), kind: "carry-forward" }
  ].filter(item => item.value > 0);
}

function buildSavingsData(summary) {
  return (summary.savingsGoalBreakdown || [])
    .map(item => ({
      ...item,
      name: `${item.name} - ${compactMoney(item.value || 0)}`
    }))
    .filter(item => item.value > 0);
}

function addTwoColumnLabelLayout(data) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (!total) return [];

  let cumulative = 0;
  const withAngles = data.map((item, index) => {
    const value = Number(item.value || 0);
    const midAngle = 90 - ((cumulative + value / 2) / total) * 360;
    const pointY = Math.sin(-midAngle * RADIAN);
    const side = Math.cos(-midAngle * RADIAN) >= 0 ? "right" : "left";
    cumulative += value;
    return {
      ...item,
      labelIndex: index,
      labelSide: side,
      labelPointY: pointY
    };
  });

  ["left", "right"].forEach(side => {
    const sideItems = withAngles
      .filter(item => item.labelSide === side)
      .sort((a, b) => a.labelPointY - b.labelPointY);

    const count = sideItems.length;
    sideItems.forEach((item, sideIndex) => {
      item.labelSlot = count <= 1 ? 0.5 : 0.14 + (sideIndex * 0.72) / (count - 1);
    });
  });

  return withAngles;
}

function CustomPieLabel(props) {
  const {
    cx,
    cy,
    midAngle,
    outerRadius,
    payload,
    fill
  } = props;

  const side = payload.labelSide || (Math.cos(-midAngle * RADIAN) >= 0 ? "right" : "left");
  const slot = Number.isFinite(payload.labelSlot) ? payload.labelSlot : 0.5;
  const startX = cx + (outerRadius + 4) * Math.cos(-midAngle * RADIAN);
  const startY = cy + (outerRadius + 4) * Math.sin(-midAngle * RADIAN);
  const elbowX = cx + (side === "right" ? outerRadius + 34 : -outerRadius - 34);
  const labelX = cx + (side === "right" ? 178 : -178);
  const labelY = 24 + slot * 252;
  const textAnchor = side === "right" ? "start" : "end";
  const lineEndX = labelX + (side === "right" ? -8 : 8);

  return (
    <g className="money-pie-label">
      <path
        d={`M${startX},${startY} L${elbowX},${labelY} L${lineEndX},${labelY}`}
        fill="none"
        stroke={fill}
        strokeWidth="1.2"
        opacity="0.82"
      />
      <circle cx={startX} cy={startY} r="2.2" fill={fill} opacity="0.92" />
      <text
        x={labelX}
        y={labelY}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fill={fill}
      >
        {payload.name}
      </text>
    </g>
  );
}

export default function MoneyBreakdownPie({ summary, includeExcludedSpending = false }) {
  const isSavingsView = summary.isSavingsView;
  const baseData = isSavingsView ? buildSavingsData(summary) : buildMoneyData(summary, includeExcludedSpending);
  const data = addTwoColumnLabelLayout(baseData);
  const colours = isSavingsView ? GOAL_COLORS : MONEY_COLORS;

  return (
    <section className="card chart-card money-pie-card">
      <h3>{isSavingsView ? "Where savings is saved for" : "Budget breakdown"}</h3>
      {data.length === 0 ? (
        <p className="muted">No {isSavingsView ? "savings goal" : "money breakdown"} data for this month.</p>
      ) : (
        <div className="money-pie-layout two-column-labels">
          <div className="money-pie-chart-wrap">
            <ResponsiveContainer width="100%" height={330}>
              <PieChart margin={{ top: 6, right: 210, bottom: 6, left: 210 }}>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={82}
                  startAngle={90}
                  endAngle={-270}
                  label={CustomPieLabel}
                  labelLine={false}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colours[index % colours.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name, props) => {
                    const payload = props?.payload;
                    if (payload?.kind === "budget") {
                      return [`${compactMoney(payload.spent)} spent of ${compactMoney(payload.limit)}`, payload.budgetName];
                    }
                    if (payload?.kind === "no-limit-budget") {
                      return [`${compactMoney(payload.spent)} spent`, `${payload.budgetName} - no budget limit`];
                    }
                    return [formatMoney(value), name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
