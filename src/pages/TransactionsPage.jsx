import { useMemo, useState } from "react";
import TransactionTable from "../components/transactions/TransactionTable.jsx";
import { formatMonthLabel } from "../utils/dates.js";

export default function TransactionsPage({ appData, actions }) {
  const defaultFilters = {
    month: actions.selectedMonth,
    categoryId: "all",
    type: "all",
    accountId: "all",
    search: ""
  };
  const [filters, setFilters] = useState(defaultFilters);
  const hasNarrowingFilters = filters.categoryId !== "all"
    || filters.type !== "all"
    || filters.accountId !== "all"
    || filters.search.trim() !== "";

  const filteredTransactions = useMemo(() => {
    return appData.transactions
      .filter(txn => txn.date.startsWith(filters.month))
      .filter(txn => filters.categoryId === "all" || (filters.categoryId === "__excluded__" ? txn.type === "expense" && txn.excludeFromBudget : txn.categoryId === filters.categoryId))
      .filter(txn => filters.type === "all" || (filters.type === "transfer" ? Boolean(txn.transferLinkId) : txn.type === filters.type))
      .filter(txn => filters.accountId === "all" || txn.accountId === filters.accountId)
      .filter(txn => {
        const query = filters.search.trim().toLowerCase();
        if (!query) return true;
        return `${txn.title} ${txn.note}`.toLowerCase().includes(query);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [appData.transactions, filters]);

  function update(field, value) {
    setFilters(prev => ({ ...prev, [field]: value }));
  }

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Transactions</p>
          <h2>All money movements</h2>
        </div>
      </div>

      <details className="filters-toggle" open={!actions.phoneMode}>
        <summary className="filters-toggle-summary">Filters</summary>
        <section className="card filters-card">
          <label>
            Month
            <input type="month" value={filters.month} onChange={e => update("month", e.target.value)} />
          </label>

          <label>
            Category
            <select value={filters.categoryId} onChange={e => update("categoryId", e.target.value)}>
              <option value="all">All categories</option>
              <option value="__excluded__">Excluded from budget</option>
              {appData.categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <label>
            Type
            <select value={filters.type} onChange={e => update("type", e.target.value)}>
              <option value="all">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>

          <label>
            Account
            <select value={filters.accountId} onChange={e => update("accountId", e.target.value)}>
              <option value="all">All accounts</option>
              {appData.accounts.map(account => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>

          <label>
            Search
            <input placeholder="Search title/note" value={filters.search} onChange={e => update("search", e.target.value)} />
          </label>
        </section>
      </details>

      {filteredTransactions.length === 0 ? (
        <section className="card empty-state-card">
          {hasNarrowingFilters ? (
            <>
              <h3>No transactions match these filters</h3>
              <p className="muted">Try a different category, type, account or search, or clear the filters.</p>
              <div className="row-actions">
                <button type="button" className="secondary-button" onClick={() => setFilters(defaultFilters)}>Clear filters</button>
              </div>
            </>
          ) : (
            <>
              <h3>No transactions{filters.month ? ` in ${formatMonthLabel(filters.month)}` : " yet"}</h3>
              <p className="muted">Add one by hand, or import a bank statement CSV to bring in a month at once.</p>
              <div className="row-actions">
                <button type="button" className="primary-button" onClick={actions.openAddTransaction}>Add transaction</button>
                <button type="button" className="secondary-button" onClick={() => actions.setActivePage("import")}>Import a CSV</button>
              </div>
            </>
          )}
        </section>
      ) : (
        <TransactionTable appData={appData} actions={actions} transactions={filteredTransactions} />
      )}
    </div>
  );
}
