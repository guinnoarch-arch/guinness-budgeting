import { useEffect, useMemo, useRef, useState } from "react";
import TransactionTable from "../components/transactions/TransactionTable.jsx";
import SavedTransactionsView from "../components/transactions/SavedTransactionsView.jsx";
import { formatMonthLabel, getNextMonthKey, getPreviousMonthKey } from "../utils/dates.js";
import { getCategorySpend } from "../utils/calculations.js";
import { setFolderTransactions } from "../services/savedFolderService.js";
import { applyBudgetSelection } from "../services/budgetAssignmentService.js";

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export default function TransactionsPage({ appData, actions }) {
  const defaultFilters = {
    month: actions.selectedMonth,
    categoryId: "all",
    type: "all",
    accountId: "all",
    search: ""
  };
  const [filters, setFilters] = useState(defaultFilters);
  // "all" is the normal list; "saved" is the Saved transactions folders.
  const [view, setView] = useState("all");
  const [openFolderId, setOpenFolderId] = useState(null);
  // While adding transactions to a folder or a budget: which one, what was
  // ticked when it opened, and what is ticked now.
  const [pick, setPick] = useState(null);
  const pickRef = useRef(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const hasNarrowingFilters = filters.categoryId !== "all"
    || filters.type !== "all"
    || filters.accountId !== "all"
    || filters.search.trim() !== "";

  // Budgets > "Add transactions" lands here with a request to pick for a budget.
  useEffect(() => {
    const intent = actions.pageIntent;
    if (intent?.page !== "transactions" || intent.intent?.type !== "pick-for-budget") return;
    startBudgetPick(intent.intent.budgetId);
    actions.clearPageIntent();
    // Only react to a new request, not to every data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions.pageIntent]);

  // Leaving this page (any other tab, or the browser's Back button) while
  // transactions are ticked saves them first, so nothing ticked is lost.
  useEffect(() => () => {
    commitPick(pickRef.current, actionsRef.current);
    pickRef.current = null;
  }, []);

  function startPick(session) {
    pickRef.current = session;
    setPick(session);
    setView("all");
  }

  function startFolderPick(folder) {
    const initialIds = (folder.transactionIds || []).filter(id => appData.transactions.some(txn => txn.id === id));
    startPick({
      kind: "folder",
      targetId: folder.id,
      title: folder.name,
      subtitle: "Tick the transactions to keep in this folder",
      initialIds,
      selected: new Set(initialIds)
    });
    setFilters(prev => ({ ...prev, month: actions.selectedMonth }));
  }

  function startBudgetPick(budgetId) {
    const item = getCategorySpend(appData, actions.selectedMonth).find(entry => entry.budget?.id === budgetId);
    if (!item) return;
    const initialIds = (item.transactions || []).map(txn => txn.id);
    startPick({
      kind: "budget",
      targetId: budgetId,
      budget: item.budget,
      title: `${item.category.name} budget`,
      subtitle: item.isYearly
        ? `Yearly budget, last 12 months to ${formatMonthLabel(actions.selectedMonth)}. Tick the expenses that count toward it`
        : `${formatMonthLabel(actions.selectedMonth)}. Tick the expenses that count toward it`,
      initialIds,
      selected: new Set(initialIds)
    });
    setFilters(prev => ({ ...prev, month: actions.selectedMonth, type: "expense" }));
  }

  function togglePick(transactionId) {
    setPick(prev => {
      if (!prev) return prev;
      const selected = new Set(prev.selected);
      if (selected.has(transactionId)) selected.delete(transactionId);
      else selected.add(transactionId);
      const next = { ...prev, selected };
      pickRef.current = next;
      return next;
    });
  }

  // Writes the ticks to the folder or budget. Does nothing if nothing changed.
  function commitPick(session, latestActions) {
    if (!session || sameSet(session.selected, new Set(session.initialIds))) return;
    const selectedIds = [...session.selected];
    latestActions.updateAppData(
      prev => session.kind === "folder"
        ? setFolderTransactions(prev, session.targetId, selectedIds)
        : applyBudgetSelection(prev, session.budget, selectedIds, session.initialIds),
      { reason: session.kind === "folder" ? "Saved folder updated" : "Budget transactions updated" }
    );
  }

  function savePick() {
    const session = pickRef.current;
    commitPick(session, actions);
    pickRef.current = null;
    setPick(null);
    if (session?.kind === "budget") actions.setActivePage("budgets");
    else setView("saved");
  }

  function cancelPick() {
    const session = pickRef.current;
    pickRef.current = null;
    setPick(null);
    if (session?.kind === "budget") actions.setActivePage("budgets");
    else setView("saved");
  }

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

  // Which budget each transaction currently counts toward, shown while
  // picking for a budget so it's clear what ticking will move.
  const budgetOfTransaction = useMemo(() => {
    const lookup = new Map();
    if (pick?.kind !== "budget") return lookup;
    getCategorySpend(appData, actions.selectedMonth).forEach(item => {
      if (!item.budget || item.budget.id === pick.targetId) return;
      (item.transactions || []).forEach(txn => lookup.set(txn.id, item.category.name));
    });
    return lookup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.kind, pick?.targetId, appData.transactions, appData.budgets, actions.selectedMonth]);

  const selection = pick ? {
    selectedIds: pick.selected,
    onToggle: txn => togglePick(txn.id),
    isSelectable: txn => pick.kind === "folder" || (txn.type === "expense" && !txn.transferLinkId),
    unselectableReason: "Only expenses can be added to a budget.",
    getNote: pick.kind === "budget"
      ? txn => {
        const other = budgetOfTransaction.get(txn.id);
        if (!other) return null;
        return pick.selected.has(txn.id) ? `Moves from ${other}` : `In ${other}`;
      }
      : null,
    label: pick.kind === "budget" ? "Add to budget" : "Add to folder",
    columnTitle: "Add"
  } : null;

  function update(field, value) {
    setFilters(prev => ({ ...prev, [field]: value }));
  }

  function shiftMonth(direction) {
    setFilters(prev => {
      const base = prev.month || actions.selectedMonth;
      return { ...prev, month: direction < 0 ? getPreviousMonthKey(base) : getNextMonthKey(base) };
    });
  }

  const showingFolders = !pick && view === "saved";

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Transactions</p>
          <h1 className="page-title">{showingFolders ? "Saved transactions" : "All money movements"}</h1>
        </div>
        {pick ? (
          <div className="pick-actions">
            <button type="button" className="secondary-button" onClick={cancelPick}>Cancel</button>
            <button type="button" className="primary-button pick-save-button" onClick={savePick}>SAVE</button>
          </div>
        ) : (
          <div className="transactions-view-tabs" role="tablist" aria-label="Transactions view">
            <button type="button" role="tab" aria-selected={view === "all"} className={`secondary-button ${view === "all" ? "active" : ""}`} onClick={() => setView("all")}>All transactions</button>
            <button type="button" role="tab" aria-selected={view === "saved"} className={`secondary-button ${view === "saved" ? "active" : ""}`} onClick={() => setView("saved")}>Saved transactions</button>
          </div>
        )}
      </div>

      {pick && (
        <section className="card pick-banner" role="status">
          <div>
            <p className="eyebrow">{pick.kind === "budget" ? "Adding to budget" : "Adding to folder"}</p>
            <h2>{pick.title}</h2>
            <p className="muted-text">{pick.subtitle}. {pick.selected.size} ticked. Press SAVE when you're done, or just open another tab and it saves for you.</p>
          </div>
        </section>
      )}

      {showingFolders ? (
        <SavedTransactionsView
          appData={appData}
          actions={actions}
          openFolderId={openFolderId}
          onOpenFolder={setOpenFolderId}
          onAddTransactions={startFolderPick}
        />
      ) : (
        <>
          <details className="filters-toggle" open={!actions.phoneMode}>
            <summary className="filters-toggle-summary">Filters</summary>
            <section className="card filters-card">
              <label>
                Month
                <span className="month-filter-row">
                  <button type="button" className="secondary-button small" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
                  <input type="month" value={filters.month} onChange={e => update("month", e.target.value)} />
                  <button type="button" className="secondary-button small" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
                </span>
                {filters.month ? (
                  <button type="button" className="text-button month-all-button" onClick={() => update("month", "")}>Show all months</button>
                ) : (
                  <small>Showing every month</small>
                )}
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
            <TransactionTable
              appData={appData}
              actions={actions}
              transactions={filteredTransactions}
              selection={selection}
              onOpenFolder={pick ? null : folderId => { setOpenFolderId(folderId); setView("saved"); }}
            />
          )}
        </>
      )}
    </div>
  );
}
