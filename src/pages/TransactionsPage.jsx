import { useMemo, useState } from "react";
import TransactionTable from "../components/transactions/TransactionTable.jsx";

export default function TransactionsPage({ appData, actions }) {
  const [filters, setFilters] = useState({
    month: actions.selectedMonth,
    categoryId: "all",
    type: "all",
    search: ""
  });

  const filteredTransactions = useMemo(() => {
    return appData.transactions
      .filter(txn => txn.date.startsWith(filters.month))
      .filter(txn => filters.categoryId === "all" || (filters.categoryId === "__excluded__" ? txn.type === "expense" && txn.excludeFromBudget : txn.categoryId === filters.categoryId))
      .filter(txn => filters.type === "all" || txn.type === filters.type)
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
          Search
          <input placeholder="Search title/note" value={filters.search} onChange={e => update("search", e.target.value)} />
        </label>
      </section>

      <TransactionTable appData={appData} actions={actions} transactions={filteredTransactions} />
    </div>
  );
}
