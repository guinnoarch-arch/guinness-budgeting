import { downloadUrl } from "./storageService.js";
import { formatMonthLabel } from "../utils/dates.js";
import { calculateMonthSummary, getCategorySpend } from "../utils/calculations.js";
import { formatMoney } from "../utils/money.js";

export function exportTransactionsCsv(data) {
  const headers = ["Date", "Type", "Title", "Category", "Account", "From Account", "To Account", "Amount", "Note"];
  const rows = data.transactions.map(txn => {
    const category = data.categories.find(cat => cat.id === txn.categoryId)?.name || "";
    const account = data.accounts.find(acc => acc.id === txn.accountId)?.name || "";
    const from = data.accounts.find(acc => acc.id === txn.fromAccountId)?.name || "";
    const to = data.accounts.find(acc => acc.id === txn.toAccountId)?.name || "";

    return [
      txn.date,
      txn.type,
      txn.title,
      category,
      account,
      from,
      to,
      txn.amount,
      txn.note || ""
    ];
  });

  const csv = [headers, ...rows]
    .map(row => row.map(escapeCsv).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, "Guinness-Budgeting-All-Transactions.csv");
  URL.revokeObjectURL(url);
}

export function exportMonthlyReportHtml(data, monthKey) {
  const summary = calculateMonthSummary(data, monthKey);
  const categorySpend = getCategorySpend(data, monthKey).filter(item => item.spent > 0 || item.limit > 0);

  const html = `
    <html>
      <head>
        <title>Guinness Budgeting Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
          h1, h2 { margin-bottom: 8px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: 8px; }
          th { background: #f9fafb; }
        </style>
      </head>
      <body>
        <h1>Guinness Budgeting</h1>
        <p>Monthly report for ${formatMonthLabel(monthKey)}</p>

        <div class="grid">
          <div class="card"><strong>Income</strong><br/>${formatMoney(summary.income)}</div>
          <div class="card"><strong>Expenses</strong><br/>${formatMoney(summary.expenses)}</div>
          <div class="card"><strong>Savings</strong><br/>${formatMoney(summary.savingsTransfers)}</div>
          <div class="card"><strong>Money Left</strong><br/>${formatMoney(summary.moneyLeft)}</div>
        </div>

        <h2>Category Breakdown</h2>
        <table>
          <thead><tr><th>Category</th><th>Spent</th><th>Budget</th><th>Remaining</th></tr></thead>
          <tbody>
            ${categorySpend.map(item => `
              <tr>
                <td>${item.category.name}</td>
                <td>${formatMoney(item.spent)}</td>
                <td>${item.limit ? formatMoney(item.limit) : "-"}</td>
                <td>${item.limit ? formatMoney(item.remaining) : "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <h2>Transactions</h2>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Amount</th></tr></thead>
          <tbody>
            ${summary.monthTransactions.map(txn => `
              <tr>
                <td>${txn.date}</td>
                <td>${txn.type}</td>
                <td>${txn.title}</td>
                <td>${formatMoney(txn.amount)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
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
