import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import useIsSmallScreen from "../../hooks/useIsSmallScreen.js";
import { smallMonthXAxisProps } from "../../utils/chartLabels.js";
import { formatMoney } from "../../utils/money.js";
import ExpandableChart from "../common/ExpandableChart.jsx";
import { AXIS_TICK, CHART_SERIES, GRID_PROPS } from "../../utils/chartTheme.js";

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
        </div>
      </div>
      <ExpandableChart title={summary.comparisonChartTitle || `${metricName} - last 6 months`} height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: isSmallScreen ? 28 : 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            tick={AXIS_TICK}
            dataKey="name"
            interval={0}
            minTickGap={4}
            {...(isSmallScreen ? smallMonthXAxisProps() : {})}
          />
          <YAxis tick={AXIS_TICK} tickFormatter={(value) => formatMoney(value, false)} />
          <Tooltip formatter={(value) => formatMoney(value)} />
          <Line type="monotone" dataKey="spending" name={metricName} stroke={CHART_SERIES[0]} strokeWidth={2.5} />
        </LineChart>
      </ExpandableChart>
    </section>
  );
}
