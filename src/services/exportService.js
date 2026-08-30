import { downloadUrl } from "./storageService.js";
import { formatMonthLabel } from "../utils/dates.js";
import { buildMonthlyReportData } from "../utils/reporting.js";
import { calculateLoanSummary } from "../utils/loanCalculations.js";
import { calculateHousesSummary } from "../utils/houseTracking.js";
import { getLinkedLoanId, getLoanById, getLoanPaymentTotalsForMonth } from "../utils/loanLinking.js";
import { formatMoney } from "../utils/money.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function exportTransactionsCsv(data) {
  const headers = ["Date", "Type", "Title", "Category", "Account", "Linked Transfer Account", "Amount", "Excluded From Budget", "Linked Loan", "Linked House", "House Contribution Type", "House Paid By", "Loan Interest", "Loan Principal", "Loan Overpayment", "Receipt", "Note"];
  const rows = data.transactions.map(txn => {
    const category = data.categories.find(cat => cat.id === txn.categoryId)?.name || "";
    const account = data.accounts.find(acc => acc.id === txn.accountId)?.name || "";
    const transferPartner = txn.transferLinkId ? data.transactions.find(item => item.id === txn.transferLinkId) : null;
    const linkedTransferAccount = transferPartner ? data.accounts.find(acc => acc.id === transferPartner.accountId)?.name || "" : "";
    const linkedLoan = getLoanById(data, getLinkedLoanId(txn));
    const linkedHouse = (data.houses || []).find(house => house.id === txn.linkedHouseId);

    return [
      txn.date,
      txn.type,
      txn.title,
      category,
      account,
      linkedTransferAccount,
      txn.amount,
      txn.excludeFromBudget ? "Yes" : "No",
      linkedLoan?.name || "",
      linkedHouse?.name || "",
      txn.houseContributionType || "",
      txn.housePersonName || "",
      txn.loanInterestAmount ?? "",
      txn.loanPrincipalAmount ?? "",
      txn.loanOverpaymentAmount ?? "",
      txn.receiptFileName || (txn.receiptId ? "Receipt attached" : ""),
      txn.note || ""
    ];
  });

  const csv = [headers, ...rows]
    .map(row => row.map(escapeCsv).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, "Guinness-Holley-Budgeting-All-Transactions.csv");
  URL.revokeObjectURL(url);
}

export function exportMonthlyReportHtml(data, monthKey) {
  const report = buildMonthlyReportData(data, monthKey);
  const { summary, categoryRows, plannedVsActual, importImpact } = report;
  const loanSummary = calculateLoanSummary(data);
  const housesSummary = calculateHousesSummary(data);
  const loanMonthTotals = getLoanPaymentTotalsForMonth(data, monthKey);

  const html = `
    <html>
      <head>
        <title>Guinness & Holley Budgeting Report - ${escapeHtml(formatMonthLabel(monthKey))}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 28px; color: #111827; }
          h1, h2, h3 { margin-bottom: 8px; }
          p { line-height: 1.45; }
          .muted { color: #6b7280; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0; }
          .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; break-inside: avoid; }
          .card strong { display: block; font-size: 1.15rem; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.92rem; }
          th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: 7px; vertical-align: top; }
          th { background: #f9fafb; }
          .section { margin-top: 26px; break-inside: avoid; }
          .negative { color: #b91c1c; font-weight: bold; }
          .positive { color: #047857; font-weight: bold; }
          .small { font-size: 0.82rem; color: #6b7280; }
          @media print { body { padding: 18px; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <h1>Guinness & Holley Budgeting</h1>
        <p class="muted">Monthly report for ${escapeHtml(report.monthLabel)} · Generated ${new Date(report.generatedAt).toLocaleString("en-GB")}</p>

        <div class="grid">
          <div class="card"><span>Income</span><strong>${formatMoney(summary.income)}</strong></div>
          <div class="card"><span>Expenses</span><strong>${formatMoney(summary.expenses)}</strong></div>
          <div class="card"><span>Savings transfers</span><strong>${formatMoney(summary.savingsTransfers)}</strong></div>
          <div class="card"><span>Budget left</span><strong>${formatMoney(summary.moneyLeft)}</strong></div>
          <div class="card"><span>Excluded spending</span><strong>${formatMoney(summary.excludedSpending || 0)}</strong></div>
        </div>

        <div class="grid-3">
          <div class="card"><span>Top category</span><strong>${escapeHtml(report.headline.topCategory?.category || "None")}</strong><p>${report.headline.topCategory ? formatMoney(report.headline.topCategory.actual) : "No spend"}</p></div>
          <div class="card"><span>Over-budget categories</span><strong>${report.headline.overBudgetCount}</strong></div>
          <div class="card"><span>Excluded spending</span><strong>${formatMoney(report.headline.excludedSpend || 0)}</strong></div>
          <div class="card"><span>CSV-linked transactions</span><strong>${report.headline.importedTransactionCount}</strong></div>
        </div>

        <div class="section">
          <h2>Category spending and budgets</h2>
          ${categoryRows.length === 0 ? "<p class='muted'>No category spending or budgets this month.</p>" : `
            <table>
              <thead><tr><th>Category</th><th>Group</th><th>Account</th><th>Counted actual</th><th>Excluded</th><th>Total actual</th><th>Budget</th><th>Left / over</th><th>Status</th></tr></thead>
              <tbody>
                ${categoryRows.map(item => `
                  <tr>
                    <td>${escapeHtml(item.category)}</td>
                    <td>${escapeHtml(item.group)}</td>
                    <td>${escapeHtml(item.account)}</td>
                    <td>${formatMoney(item.actual)}</td>
                    <td>${formatMoney(item.excludedActual || 0)}</td>
                    <td>${formatMoney(item.totalActual ?? item.actual)}</td>
                    <td>${item.planned > 0 ? formatMoney(item.planned) : "-"}</td>
                    <td class="${item.remaining < 0 ? "negative" : "positive"}">${item.planned > 0 ? formatMoney(item.remaining) : "-"}</td>
                    <td>${escapeHtml(item.status)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}
        </div>

        <div class="section">
          <h2>Income breakdown</h2>
          ${report.incomeByCategory.length === 0 ? "<p class='muted'>No income this month.</p>" : `
            <table>
              <thead><tr><th>Income category</th><th>Amount</th></tr></thead>
              <tbody>${report.incomeByCategory.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${formatMoney(item.amount)}</td></tr>`).join("")}</tbody>
            </table>
          `}
        </div>

        <div class="section">
          <h2>Loans summary</h2>
          <div class="grid">
            <div class="card"><span>Total debt</span><strong>${formatMoney(loanSummary.totalDebt)}</strong></div>
            <div class="card"><span>Linked loan payments</span><strong>${formatMoney(loanMonthTotals.paymentAmount)}</strong></div>
            <div class="card"><span>Capital paid this month</span><strong>${formatMoney(loanMonthTotals.principalAmount)}</strong></div>
            <div class="card"><span>Interest logged this month</span><strong>${formatMoney(loanMonthTotals.interestAmount)}</strong></div>
          </div>
          ${loanSummary.loans.length === 0 ? "<p class='muted'>No loans are being tracked yet.</p>" : `
            <table>
              <thead><tr><th>Loan</th><th>Type</th><th>Balance</th><th>Est. repayment</th><th>Est. interest</th><th>Balance date</th></tr></thead>
              <tbody>${loanSummary.loans.map((loan, index) => {
                const estimate = loanSummary.estimates[index];
                return `<tr><td>${escapeHtml(loan.name)}</td><td>${escapeHtml(loan.type)}</td><td>${formatMoney(loan.currentBalance)}</td><td>${formatMoney(estimate?.monthlyRepayment || 0)}</td><td>${formatMoney(estimate?.monthlyInterest || 0)}</td><td>${escapeHtml(loan.balanceDate || "-")}</td></tr>`;
              }).join("")}</tbody>
            </table>
          `}
        </div>

        <div class="section">
          <h2>House summary</h2>
          <div class="grid">
            <div class="card"><span>Total house value</span><strong>${formatMoney(housesSummary.totalHouseValue)}</strong></div>
            <div class="card"><span>Total mortgage balance</span><strong>${formatMoney(housesSummary.totalMortgageBalance)}</strong></div>
            <div class="card"><span>Estimated equity</span><strong>${formatMoney(housesSummary.totalEquity)}</strong></div>
            <div class="card"><span>Total contributed</span><strong>${formatMoney(housesSummary.totalContributed)}</strong></div>
          </div>
          ${housesSummary.activeHouses.length === 0 ? "<p class='muted'>No houses are being tracked yet.</p>" : `
            <table>
              <thead><tr><th>House</th><th>Value</th><th>Mortgage</th><th>Equity estimate</th><th>Contributed</th></tr></thead>
              <tbody>${housesSummary.summaries.filter(item => item.house.status !== "archived" && !item.house.archived).map(item => `<tr><td>${escapeHtml(item.house.name)}</td><td>${formatMoney(item.summary.propertyValue)}</td><td>${formatMoney(item.summary.mortgageBalance)}</td><td>${formatMoney(item.summary.estimatedEquity)}</td><td>${formatMoney(item.summary.totalContributed)}</td></tr>`).join("")}</tbody>
            </table>
          `}
          <p class="muted">Contribution split is a tracking estimate only, not legal ownership.</p>
        </div>

        <div class="section">
          <h2>Savings breakdown</h2>
          ${report.savingsByAccount.length === 0 ? "<p class='muted'>No savings transfers this month.</p>" : `
            <table>
              <thead><tr><th>Savings account</th><th>Amount saved</th></tr></thead>
              <tbody>${report.savingsByAccount.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${formatMoney(item.amount)}</td></tr>`).join("")}</tbody>
            </table>
          `}
        </div>

        <div class="section">
          <h2>Planned vs actual</h2>
          <p class="muted">Planned total ${formatMoney(plannedVsActual.totalPlanned)} · Actual total ${formatMoney(plannedVsActual.totalActual)} · Difference ${formatMoney(plannedVsActual.difference)}</p>
          ${plannedVsActual.rows.length === 0 ? "<p class='muted'>No planned-vs-actual matches this month.</p>" : `
            <table>
              <thead><tr><th>Item</th><th>Type</th><th>Planned</th><th>Actual</th><th>Difference</th><th>Status</th></tr></thead>
              <tbody>
                ${plannedVsActual.rows.slice(0, 20).map(row => `
                  <tr>
                    <td>${escapeHtml(row.title)}<div class="small">${escapeHtml(row.category)} · ${escapeHtml(row.account)}</div></td>
                    <td>${escapeHtml(row.type)}</td>
                    <td>${formatMoney(row.plannedAmount)}<div class="small">${escapeHtml(row.plannedDate)}</div></td>
                    <td>${formatMoney(row.actualAmount)}<div class="small">${escapeHtml(row.actualDate)}</div></td>
                    <td class="${row.difference > 0 ? "negative" : row.difference < 0 ? "positive" : ""}">${formatMoney(row.difference)}</td>
                    <td>${escapeHtml(row.status)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}
        </div>

        <div class="section">
          <h2>CSV import impact</h2>
          <div class="grid">
            <div class="card"><span>Import batches</span><strong>${importImpact.batchCount}</strong></div>
            <div class="card"><span>Created rows</span><strong>${importImpact.createdRows}</strong></div>
            <div class="card"><span>Linked rows</span><strong>${importImpact.linkedRows}</strong></div>
            <div class="card"><span>Reconciliation adjustments</span><strong>${importImpact.reconciliationAdjustments.length}</strong></div>
          </div>
          ${importImpact.batches.length === 0 ? "<p class='muted'>No CSV import batches linked to this month.</p>" : `
            <table>
              <thead><tr><th>File</th><th>CSV latest date</th><th>New</th><th>Linked</th><th>Skipped</th><th>Reconciliation</th></tr></thead>
              <tbody>${importImpact.batches.map(batch => `<tr><td>${escapeHtml(batch.fileName)}</td><td>${escapeHtml(batch.latestCsvDate || "-")}</td><td>${batch.importedRows}</td><td>${batch.linkedRows}</td><td>${batch.skippedRows}</td><td>${escapeHtml(batch.reconciliationStatus || "-")}</td></tr>`).join("")}</tbody>
            </table>
          `}
        </div>

        <div class="section">
          <h2>Largest expenses</h2>
          ${report.topExpenses.length === 0 ? "<p class='muted'>No expenses this month.</p>" : `
            <table>
              <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Account</th><th>Amount</th></tr></thead>
              <tbody>${report.topExpenses.map(txn => `<tr><td>${escapeHtml(txn.date)}</td><td>${escapeHtml(txn.title)}</td><td>${escapeHtml(txn.category)}</td><td>${escapeHtml(txn.account)}</td><td>${formatMoney(txn.amount)}</td></tr>`).join("")}</tbody>
            </table>
          `}
        </div>
      </body>
    </html>
  `;

  const reportWindow = window.open("", "_blank");
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.print();
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
