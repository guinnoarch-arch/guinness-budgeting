import { exportMonthlyReportHtml, exportTransactionsCsv } from "../services/exportService.js";
import { exportJsonBackup } from "../services/storageService.js";
import { calculateMonthSummary } from "../utils/calculations.js";
import { formatMoney } from "../utils/money.js";
import MonthSelector from "../components/dashboard/MonthSelector.jsx";

export default function ReportsPage({ appData, actions }) {
  const summary = calculateMonthSummary(appData, actions.selectedMonth);

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Monthly report</h2>
        </div>
        <MonthSelector selectedMonth={actions.selectedMonth} setSelectedMonth={actions.setSelectedMonth} />
      </div>

      <div className="summary-grid">
        <section className="card summary-card"><p className="eyebrow">Income</p><h3>{formatMoney(summary.income)}</h3></section>
        <section className="card summary-card"><p className="eyebrow">Expenses</p><h3>{formatMoney(summary.expenses)}</h3></section>
        <section className="card summary-card"><p className="eyebrow">Savings rate</p><h3>{summary.savingsRate.toFixed(0)}%</h3></section>
        <section className="card summary-card"><p className="eyebrow">Average daily spend</p><h3>{formatMoney(summary.averageDailySpend)}</h3></section>
      </div>

      <section className="card">
        <h3>Exports</h3>
        <div className="row-actions">
          <button className="primary-button" onClick={() => exportMonthlyReportHtml(appData, actions.selectedMonth)}>
            Export PDF / Print report
          </button>
          <button className="secondary-button" onClick={() => exportTransactionsCsv(appData)}>
            Export all transactions CSV
          </button>
          <button className="secondary-button" onClick={() => exportJsonBackup(appData)}>
            Export JSON backup
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Largest expense</h3>
        {summary.largestExpense ? (
          <p>{summary.largestExpense.title}: <strong>{formatMoney(summary.largestExpense.amount)}</strong></p>
        ) : (
          <p className="muted">No expense transactions this month.</p>
        )}
      </section>
    </div>
  );
}
