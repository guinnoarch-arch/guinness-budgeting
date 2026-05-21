import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { exportMonthlyReportHtml, exportTransactionsCsv } from "../services/exportService.js";
import { exportJsonBackup } from "../services/storageService.js";
import { buildMonthlyReportData } from "../utils/reporting.js";
import { calculateLoanSummary } from "../utils/loanCalculations.js";
import { getLoanPaymentTotalsForMonth } from "../utils/loanLinking.js";
import { formatMoney } from "../utils/money.js";
import MonthSelector from "../components/dashboard/MonthSelector.jsx";

function ReportCard({ label, value, detail, tone = "" }) {
  return (
    <section className={`card summary-card report-summary-card ${tone}`}>
      <p className="eyebrow">{label}</p>
      <h3>{value}</h3>
      {detail && <p className="muted-text">{detail}</p>}
    </section>
  );
}

function EmptyReportBlock({ children = "No data for this report section yet." }) {
  return <p className="muted-text empty-report-block">{children}</p>;
}

function MoneyTooltip({ active, payload, label }) {
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

export default function ReportsPage({ appData, actions }) {
  const report = buildMonthlyReportData(appData, actions.selectedMonth);
  const { summary, categoryRows, plannedVsActual, importImpact } = report;
  const loanSummary = calculateLoanSummary(appData);
  const monthlyLoanTotals = getLoanPaymentTotalsForMonth(appData, actions.selectedMonth);

  const incomeExpenseChart = report.monthlyTrend.map(row => ({
    ...row,
    net: row.income - row.expenses - row.savings
  }));

  return (
    <div className="page-grid reports-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Monthly report</h2>
          <p className="muted-text">Analyse income, spending, savings, CSV imports, account balances, and planned-vs-actual performance.</p>
        </div>
        <MonthSelector selectedMonth={actions.selectedMonth} setSelectedMonth={actions.setSelectedMonth} />
      </div>

      <div className="summary-grid reports-summary-grid">
        <ReportCard label="Income" value={formatMoney(summary.income)} detail={`${summary.monthTransactions.length} total transaction(s)`} />
        <ReportCard label="Expenses" value={formatMoney(summary.expenses)} detail={summary.largestExpense ? `Largest: ${summary.largestExpense.title}` : "No expenses this month"} tone={summary.expenses > summary.income ? "danger-soft" : ""} />
        <ReportCard label="Savings transfers" value={formatMoney(summary.savingsTransfers)} detail={`${summary.savingsRate.toFixed(0)}% of income`} />
        <ReportCard label="Budget left" value={formatMoney(summary.moneyLeft)} detail={summary.moneyLeft < 0 ? "Over budget this month" : "Active budgets minus counted spend"} tone={summary.moneyLeft < 0 ? "danger-soft" : "success-soft"} />
        <ReportCard label="Excluded spending" value={formatMoney(summary.excludedSpending || 0)} detail="Not counted against monthly budgets" tone={summary.excludedSpending > 0 ? "warning" : ""} />
        <ReportCard label="Loan payments" value={formatMoney(monthlyLoanTotals.paymentAmount)} detail={`${monthlyLoanTotals.count} linked loan transaction(s)`} />
        <ReportCard label="Loan capital paid" value={formatMoney(monthlyLoanTotals.principalAmount)} detail={`${formatMoney(monthlyLoanTotals.interestAmount)} interest logged`} />
      </div>

      <section className="card report-insight-card">
        <div>
          <p className="eyebrow">Report insight</p>
          <h3>{report.monthLabel}</h3>
          <p className="muted-text">
            Top spending category: <strong>{report.headline.topCategory?.category || "None yet"}</strong>
            {report.headline.topCategory ? ` at ${formatMoney(report.headline.topCategory.actual)}.` : "."}
          </p>
        </div>
        <div className="report-insight-grid">
          <p><span>Over-budget categories</span><strong>{report.headline.overBudgetCount}</strong></p>
          <p><span>Unbudgeted counted spend</span><strong>{formatMoney(report.headline.noBudgetSpend)}</strong></p>
          <p><span>Excluded spending</span><strong>{formatMoney(report.headline.excludedSpend)}</strong></p>
          <p><span>CSV-imported rows this month</span><strong>{report.headline.importedTransactionCount}</strong></p>
        </div>
      </section>

      <div className="report-chart-grid">
        <section className="card chart-card report-chart-card">
          <div className="section-header compact-header">
            <div>
              <h3>Income, expenses and savings trend</h3>
              <p className="muted-text">Six-month view using the selected month as the end point.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={incomeExpenseChart} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => formatMoney(value, false)} />
              <Tooltip content={<MoneyTooltip />} />
              <Legend />
              <Bar dataKey="income" name="Income" fill="#16a34a" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#dc2626" radius={[6, 6, 0, 0]} />
              <Bar dataKey="savings" name="Savings" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card chart-card report-chart-card">
          <div className="section-header compact-header">
            <div>
              <h3>Account balance trend</h3>
              <p className="muted-text">Month-end account totals across all active accounts.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={report.accountBalanceTrend} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => formatMoney(value, false)} />
              <Tooltip content={<MoneyTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="total" name="Total balance" stroke="#0f766e" fill="#ccfbf1" strokeWidth={3} />
              <Area type="monotone" dataKey="spendable" name="Spendable" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} />
              <Area type="monotone" dataKey="savings" name="Savings" stroke="#d97706" fill="#fef3c7" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="card report-section-card">
        <div className="section-header compact-header">
          <div>
            <h3>Category spending and budgets</h3>
            <p className="muted-text">Actual spending compared with category budgets for the selected month.</p>
          </div>
        </div>
        {categoryRows.length === 0 ? (
          <EmptyReportBlock>No category spend or budgets this month.</EmptyReportBlock>
        ) : (
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Group</th>
                  <th>Account</th>
                  <th>Counted actual</th>
                  <th>Excluded</th>
                  <th>Total actual</th>
                  <th>Budget</th>
                  <th>Left / over</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {categoryRows.map(row => (
                  <tr key={row.id}>
                    <td><strong>{row.category}</strong></td>
                    <td>{row.group}</td>
                    <td>{row.account}</td>
                    <td>{formatMoney(row.actual)}</td>
                    <td>{formatMoney(row.excludedActual || 0)}</td>
                    <td>{formatMoney(row.totalActual ?? row.actual)}</td>
                    <td>{row.planned > 0 ? formatMoney(row.planned) : "—"}</td>
                    <td className={row.remaining < 0 ? "negative-text" : "positive-text"}>{row.planned > 0 ? formatMoney(row.remaining) : "—"}</td>
                    <td><span className={`pill ${row.status === "Over budget" ? "expense" : row.status === "Watch" ? "warning" : ""}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="report-chart-grid">
        <section className="card report-section-card">
          <h3>Income breakdown</h3>
          {report.incomeByCategory.length === 0 ? <EmptyReportBlock>No income this month.</EmptyReportBlock> : (
            <div className="simple-list">
              {report.incomeByCategory.map(item => (
                <div key={item.name} className="simple-row">
                  <span>{item.name}</span>
                  <strong>{formatMoney(item.amount)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card report-section-card">
          <h3>Savings breakdown</h3>
          {report.savingsByAccount.length === 0 ? <EmptyReportBlock>No savings transfers this month.</EmptyReportBlock> : (
            <div className="simple-list">
              {report.savingsByAccount.map(item => (
                <div key={item.name} className="simple-row">
                  <span>{item.name}</span>
                  <strong>{formatMoney(item.amount)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card report-section-card">
        <div className="section-header compact-header">
          <div>
            <h3>Planned vs actual</h3>
            <p className="muted-text">Matched CSV rows keep the original planned amount/date and show the actual bank amount/date.</p>
          </div>
          <div className="report-mini-summary">
            <span>Planned {formatMoney(plannedVsActual.totalPlanned)}</span>
            <strong>Actual {formatMoney(plannedVsActual.totalActual)}</strong>
          </div>
        </div>
        {plannedVsActual.rows.length === 0 ? (
          <EmptyReportBlock>No planned-vs-actual matches this month yet. This will fill when planned rows are matched against CSV imports.</EmptyReportBlock>
        ) : (
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th>Difference</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plannedVsActual.rows.slice(0, 12).map(row => (
                  <tr key={row.id}>
                    <td><strong>{row.title}</strong><small>{row.category} · {row.account}</small></td>
                    <td>{row.type}</td>
                    <td>{formatMoney(row.plannedAmount)}<small>{row.plannedDate}</small></td>
                    <td>{formatMoney(row.actualAmount)}<small>{row.actualDate}</small></td>
                    <td className={row.difference > 0 ? "negative-text" : row.difference < 0 ? "positive-text" : ""}>{formatMoney(row.difference)}</td>
                    <td><span className="pill transfer">{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card report-section-card">
        <div className="section-header compact-header">
          <div>
            <h3>CSV import impact</h3>
            <p className="muted-text">Shows how much of the month came from bank CSV import and reconciliation.</p>
          </div>
          <div className="report-mini-summary">
            <span>{importImpact.batchCount} batch(es)</span>
            <strong>{importImpact.importedTransactionCount} CSV-linked transaction(s)</strong>
          </div>
        </div>
        <div className="import-analysis-summary report-import-summary">
          <div className="summary-line"><span>Created rows</span><strong>{importImpact.createdRows}</strong></div>
          <div className="summary-line"><span>Linked rows</span><strong>{importImpact.linkedRows}</strong></div>
          <div className="summary-line"><span>Skipped rows</span><strong>{importImpact.skippedRows}</strong></div>
          <div className="summary-line"><span>Reconciliation adjustments</span><strong>{importImpact.reconciliationAdjustments.length}</strong></div>
        </div>
        {importImpact.batches.length > 0 && (
          <div className="archive-list report-import-batches">
            {importImpact.batches.slice(0, 5).map(batch => (
              <div key={batch.id} className="archive-row">
                <div>
                  <strong>{batch.fileName}</strong>
                  <small>{batch.latestCsvDate || "No CSV date"} · {batch.reconciliationStatus}</small>
                </div>
                <div className="archive-row-actions">
                  <span className="pill">{batch.importedRows} new</span>
                  <span className="pill transfer">{batch.linkedRows} linked</span>
                  <span className="pill expense">{batch.skippedRows} skipped</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card report-section-card">
        <div className="section-header compact-header">
          <div>
            <h3>Loans summary</h3>
            <p className="muted-text">Tracked loan balances and linked loan-payment activity for the selected month.</p>
          </div>
          <div className="report-mini-summary">
            <span>Total debt {formatMoney(loanSummary.totalDebt)}</span>
            <strong>Payments {formatMoney(monthlyLoanTotals.paymentAmount)}</strong>
          </div>
        </div>

        {loanSummary.loans.length === 0 ? (
          <EmptyReportBlock>No loans are being tracked yet.</EmptyReportBlock>
        ) : (
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Loan</th>
                  <th>Type</th>
                  <th>Balance</th>
                  <th>Est. monthly repayment</th>
                  <th>Est. monthly interest</th>
                  <th>Balance date</th>
                </tr>
              </thead>
              <tbody>
                {loanSummary.loans.map((loan, index) => {
                  const estimate = loanSummary.estimates[index];
                  return (
                    <tr key={loan.id}>
                      <td><strong>{loan.name}</strong></td>
                      <td>{loan.type === "mortgage" ? "Mortgage" : loan.type === "studentLoan" ? "Student loan" : "Loan"}</td>
                      <td>{formatMoney(loan.currentBalance)}</td>
                      <td>{formatMoney(estimate?.monthlyRepayment || 0)}</td>
                      <td>{formatMoney(estimate?.monthlyInterest || 0)}</td>
                      <td>{loan.balanceDate || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card report-section-card">
        <h3>Largest expenses</h3>
        {report.topExpenses.length === 0 ? <EmptyReportBlock>No expenses this month.</EmptyReportBlock> : (
          <div className="simple-list">
            {report.topExpenses.map(transaction => (
              <div key={transaction.id} className="simple-row">
                <span>{transaction.date} · {transaction.title}<small>{transaction.category} · {transaction.account}</small></span>
                <strong>{formatMoney(transaction.amount)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>Exports</h3>
        <p className="muted-text">The PDF/print report now includes summary cards, category budget results, planned-vs-actual rows, CSV import impact, and largest expenses.</p>
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
    </div>
  );
}
