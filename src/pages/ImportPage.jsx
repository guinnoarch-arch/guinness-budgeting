import { useMemo, useState } from "react";
import {
  analyseCsvImport,
  applyCsvImport,
  parseCsvText,
  suggestColumnMap,
  undoCsvImport,
  findSavedCsvColumnMapping
} from "../services/csvImportService.js";
import { calculateAccountBalanceAtDate } from "../utils/calculations.js";
import { createId } from "../utils/ids.js";
import { formatMoney } from "../utils/money.js";

const ADD_ACCOUNT_VALUE = "__add_account__";

const emptyColumnMap = {
  date: "",
  description: "",
  amount: "",
  paidIn: "",
  paidOut: "",
  balance: ""
};

const emptyAccountForm = {
  name: "",
  type: "current",
  openingBalance: "0"
};

const previewFilters = [
  ["all", "All"],
  ["needs_review", "Needs review"],
  ["duplicates", "Duplicates"],
  ["transfers", "Transfers"],
  ["matched", "Matched"],
  ["new", "New"]
];

function formatDate(value) {
  if (!value) return "—";
  return value;
}

function getRowEdit(rowEdits, row) {
  return rowEdits[row.id] || {};
}

function getSignedDisplay(row) {
  return row.signedAmount >= 0 ? `+${formatMoney(row.amount)}` : `-${formatMoney(row.amount)}`;
}

function getActionOptions(row) {
  const base = [
    ["new", "Create new transaction"],
    ["match_planned", "Link to planned/manual transaction"],
    ["new_transfer", "Create transfer"],
    ["match_existing_transfer", "Link to existing transfer"],
    ["duplicate", "Skip as duplicate"]
  ];

  const hasMatch = Boolean(row.matchTransactionId);

  return base.filter(([value]) => {
    if (value === "match_planned" && (!hasMatch || row.type === "transfer")) return false;
    if (value === "match_existing_transfer" && (!hasMatch || row.type !== "transfer")) return false;
    return true;
  });
}

function getEditedAction(row, rowEdits) {
  return getRowEdit(rowEdits, row).action || row.action;
}

function getEditedType(row, rowEdits) {
  return getRowEdit(rowEdits, row).type || row.type;
}

function rowMatchesFilter(row, rowEdits, filter) {
  const action = getEditedAction(row, rowEdits);
  const type = getEditedType(row, rowEdits);

  if (filter === "all") return true;
  if (filter === "needs_review") return Boolean(row.warning) || row.confidence === "Needs review" || (type === "transfer" && action !== "match_existing_transfer" && !(getRowEdit(rowEdits, row).linkedAccountId || row.linkedAccountId));
  if (filter === "duplicates") return action === "duplicate";
  if (filter === "transfers") return type === "transfer";
  if (filter === "matched") return action === "match_planned" || action === "match_existing_transfer";
  if (filter === "new") return action === "new" || action === "new_transfer";
  return true;
}

function getFilterCount(rows, rowEdits, filter) {
  return rows.filter(row => rowMatchesFilter(row, rowEdits, filter)).length;
}

function getProjectedBalanceAtDate(appData, analysis, rowEdits) {
  if (!analysis?.reconciliation?.available) return null;

  const cutoffDate = analysis.reconciliation.latestCsvDate;
  const accountId = analysis.accountId;
  let projected = calculateAccountBalanceAtDate(appData, accountId, cutoffDate);

  analysis.rows.forEach(row => {
    const edit = getRowEdit(rowEdits, row);
    const include = edit.include ?? row.defaultInclude;
    if (!include || !row.date || row.date > cutoffDate) return;

    const action = edit.action || row.action;
    const type = edit.type || row.type;
    if (action === "duplicate" || action === "match_existing_transfer") return;

    if (action === "match_planned" && row.matchTransactionId) {
      const existing = appData.transactions.find(transaction => transaction.id === row.matchTransactionId);
      if (existing) {
        const previousSigned = getSignedAmountForAccount(existing, accountId, cutoffDate);
        projected -= previousSigned;
      }
      projected += row.signedAmount;
      return;
    }

    if (type === "income" || type === "expense" || type === "transfer") {
      projected += row.signedAmount;
    }
  });

  return projected;
}

function getSignedAmountForAccount(transaction, accountId, cutoffDate) {
  if (!transaction || !accountId || !transaction.date || transaction.date > cutoffDate) return 0;
  if (transaction.type === "income" && transaction.accountId === accountId) return Number(transaction.amount || 0);
  if (transaction.type === "expense" && transaction.accountId === accountId) return -Number(transaction.amount || 0);
  if (transaction.type === "transfer") {
    if (transaction.toAccountId === accountId) return Number(transaction.amount || 0);
    if (transaction.fromAccountId === accountId) return -Number(transaction.amount || 0);
  }
  return 0;
}

function ReconciliationPreview({ appData, analysis, rowEdits, createAdjustment, setCreateAdjustment }) {
  const reconciliation = analysis?.reconciliation;
  if (!reconciliation?.available) {
    return (
      <div className="import-reconciliation-box muted-box">
        <strong>Balance check unavailable</strong>
        <span>{reconciliation?.message || "Map a balance column if your CSV includes one."}</span>
      </div>
    );
  }

  const gbBalanceBefore = calculateAccountBalanceAtDate(appData, analysis.accountId, reconciliation.latestCsvDate);
  const projectedBalance = getProjectedBalanceAtDate(appData, analysis, rowEdits);
  const projectedDifference = projectedBalance === null ? reconciliation.csvClosingBalance - gbBalanceBefore : reconciliation.csvClosingBalance - projectedBalance;
  const differenceIsZero = Math.abs(projectedDifference) < 0.005;

  return (
    <div className={`import-reconciliation-box ${differenceIsZero ? "ok" : "warning"}`}>
      <div>
        <strong>{differenceIsZero ? "Balance check matched" : "Balance check needs review"}</strong>
        <span>{reconciliation.message}</span>
      </div>

      <div className="import-balance-grid">
        <p><span>CSV date</span><strong>{formatDate(reconciliation.latestCsvDate)}</strong></p>
        <p><span>CSV balance</span><strong>{formatMoney(reconciliation.csvClosingBalance)}</strong></p>
        <p><span>GH balance before import</span><strong>{formatMoney(gbBalanceBefore)}</strong></p>
        <p><span>Projected after selected rows</span><strong>{formatMoney(projectedBalance ?? gbBalanceBefore)}</strong></p>
        <p><span>Projected difference</span><strong>{formatMoney(projectedDifference)}</strong></p>
        <p><span>Check mode</span><strong>{reconciliation.comparisonMode === "current" ? "Current" : "Historical"}</strong></p>
      </div>

      {!differenceIsZero && (
        <label className="checkbox-label import-reconcile-toggle">
          <input
            type="checkbox"
            checked={createAdjustment}
            onChange={event => setCreateAdjustment(event.target.checked)}
          />
          Create a dated reconciliation adjustment after import if the final imported balance still does not match the CSV balance.
        </label>
      )}
    </div>
  );
}

function ImportAnalysisSummary({ analysis }) {
  const totals = analysis.totals;
  const balanceText = analysis.reconciliation?.available
    ? `${formatMoney(analysis.reconciliation.csvClosingBalance)} on ${analysis.reconciliation.latestCsvDate}`
    : "No CSV balance";

  return (
    <section className="card import-analysis-summary">
      <div className="section-header compact-header">
        <div>
          <h3>Import summary</h3>
          <p className="muted-text">Check this before saving. Rows marked as duplicates are unticked by default.</p>
        </div>
      </div>

      <div className="import-summary-list">
        <SummaryLine label="Rows found" value={totals.total} />
        <SummaryLine label="New transactions/transfers" value={totals.newRows} />
        <SummaryLine label="Matched planned transactions" value={totals.plannedMatches} />
        <SummaryLine label="Matched existing transfers" value={totals.existingTransferMatches} />
        <SummaryLine label="Duplicates" value={totals.duplicates} />
        <SummaryLine label="Needs review" value={totals.needsReview} />
        <SummaryLine label="Large expenses flagged" value={totals.largeExpenses || 0} />
        <SummaryLine label="CSV closing/latest balance" value={balanceText} />
      </div>
    </section>
  );
}

export default function ImportPage({ appData, actions }) {
  const activeAccounts = (appData.accounts || []).filter(account => account.isActive !== false);
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccounts[0]?.id || "");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMap, setColumnMap] = useState(emptyColumnMap);
  const [analysis, setAnalysis] = useState(null);
  const [rowEdits, setRowEdits] = useState({});
  const [createAdjustment, setCreateAdjustment] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [accountModal, setAccountModal] = useState(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [detailBatchId, setDetailBatchId] = useState(null);

  const incomeCategories = useMemo(() => (appData.categories || []).filter(category => category.type === "income" && category.isActive !== false), [appData.categories]);
  const expenseCategories = useMemo(() => (appData.categories || []).filter(category => category.type === "expense" && category.isActive !== false), [appData.categories]);
  const latestImportBatches = (appData.importBatches || []).slice(0, 5);
  const visibleRows = analysis ? analysis.rows.filter(row => rowMatchesFilter(row, rowEdits, activeFilter)) : [];

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("");
    setAnalysis(null);
    setRowEdits({});
    setCreateAdjustment(false);
    setActiveFilter("all");

    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (!parsed.headers.length || !parsed.rows.length) {
        setStatus("Could not find a header row and transaction rows in that CSV.");
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const savedMapping = findSavedCsvColumnMapping(appData, parsed.headers);
      const nextColumnMap = savedMapping?.columnMap
        ? { ...emptyColumnMap, ...savedMapping.columnMap }
        : { ...emptyColumnMap, ...suggestColumnMap(parsed.headers) };
      setColumnMap(nextColumnMap);
      if (savedMapping?.accountId && appData.accounts.some(account => account.id === savedMapping.accountId && account.isActive !== false)) {
        setSelectedAccountId(savedMapping.accountId);
      }
      const ignoredRowsText = parsed.ignoredTopRows > 0 ? ` Ignored ${parsed.ignoredTopRows} statement title/header note row(s).` : "";
      const mappingText = savedMapping ? ` Used saved CSV mapping: ${savedMapping.name || savedMapping.fileName || "saved format"}.` : "";
      setStatus(`Loaded ${parsed.rows.length} CSV transaction row(s).${ignoredRowsText}${mappingText} Check the column mapping, then analyse.`);
    } catch (error) {
      console.error("CSV read failed:", error);
      setStatus("Could not read this CSV file.");
    } finally {
      event.target.value = "";
    }
  }

  function updateColumnMap(field, value) {
    setColumnMap(prev => ({ ...prev, [field]: value }));
    setAnalysis(null);
  }

  function handleStatementAccountChange(value) {
    if (value === ADD_ACCOUNT_VALUE) {
      openAddAccountModal({ mode: "statement", rowId: null, suggestedName: "" });
      return;
    }

    setSelectedAccountId(value);
    setAnalysis(null);
  }

  function handleTransferAccountChange(row, value) {
    if (value === ADD_ACCOUNT_VALUE) {
      openAddAccountModal({ mode: "transfer", rowId: row.id, suggestedName: row.externalAccountName || "" });
      return;
    }

    updateRow(row.id, "linkedAccountId", value);
    updateRow(row.id, "include", Boolean(value));
  }

  function openAddAccountModal(context) {
    setAccountModal(context);
    setAccountForm({
      name: context.suggestedName || "",
      type: context.mode === "transfer" && context.suggestedName.toLowerCase().includes("saving") ? "savings" : "current",
      openingBalance: "0"
    });
  }

  function closeAccountModal() {
    setAccountModal(null);
    setAccountForm(emptyAccountForm);
  }

  function updateAccountForm(field, value) {
    setAccountForm(prev => ({ ...prev, [field]: value }));
  }

  function saveNewAccount(event) {
    event.preventDefault();

    const name = accountForm.name.trim();
    const openingBalance = parseFloat(accountForm.openingBalance || "0");
    if (!name) return setStatus("Enter an account name before adding it.");
    if (!Number.isFinite(openingBalance)) return setStatus("Enter a valid opening balance for the new account.");

    const now = new Date().toISOString();
    const newAccount = {
      id: createId("acc"),
      name,
      type: accountForm.type,
      openingBalance,
      isDefault: false,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    actions.updateAppData({
      ...appData,
      accounts: [...appData.accounts, newAccount]
    });

    if (accountModal?.mode === "statement") {
      setSelectedAccountId(newAccount.id);
      setAnalysis(null);
    }

    if (accountModal?.mode === "transfer" && accountModal.rowId) {
      updateRow(accountModal.rowId, "linkedAccountId", newAccount.id);
      updateRow(accountModal.rowId, "include", true);
    }

    setStatus(`Added account: ${name}.`);
    closeAccountModal();
  }

  function analyseImport() {
    if (!selectedAccountId) return setStatus("Choose the GH account this CSV belongs to.");
    if (!columnMap.date || !columnMap.description) return setStatus("Map at least Date and Description.");
    if (!columnMap.amount && (!columnMap.paidIn || !columnMap.paidOut)) return setStatus("Map either a signed Amount column or both Paid In and Paid Out columns.");

    const nextAnalysis = analyseCsvImport(appData, {
      accountId: selectedAccountId,
      fileName,
      headers,
      rows,
      columnMap
    });

    const initialEdits = {};
    nextAnalysis.rows.forEach(row => {
      initialEdits[row.id] = {
        include: row.defaultInclude,
        action: row.action,
        type: row.type,
        categoryId: row.categoryId || "",
        linkedAccountId: row.linkedAccountId || "",
        matchTransactionId: row.matchTransactionId || "",
        excludeFromBudget: false
      };
    });

    setAnalysis(nextAnalysis);
    setRowEdits(initialEdits);
    setCreateAdjustment(false);
    setActiveFilter("all");
    setStatus(`Analysed ${nextAnalysis.rows.length} usable transaction row(s). Review before importing.`);
  }

  function updateRow(rowId, field, value) {
    setRowEdits(prev => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [field]: value
      }
    }));
  }

  function confirmImport() {
    if (!analysis) return;

    const missingTransfer = analysis.rows.some(row => {
      const edit = rowEdits[row.id] || {};
      const include = edit.include ?? row.defaultInclude;
      const type = edit.type || row.type;
      const action = edit.action || row.action;
      const linkedAccountId = edit.linkedAccountId || row.linkedAccountId;
      return include && type === "transfer" && action !== "match_existing_transfer" && !linkedAccountId;
    });

    if (missingTransfer) {
      setStatus("One or more selected transfers needs the other GH account choosing first.");
      setActiveFilter("needs_review");
      return;
    }

    const result = applyCsvImport(appData, analysis, rowEdits, {
      createReconciliationAdjustment: createAdjustment
    });

    actions.updateAppData(result.data, { major: true, reason: "CSV import completed" });
    setStatus(`Import complete: ${result.result.importedTransactionIds.length} new, ${result.result.linkedTransactionIds.length} linked, ${result.result.skippedRows.length} skipped.`);
    setAnalysis(null);
    setRows([]);
    setHeaders([]);
    setFileName("");
    setRowEdits({});
    setCreateAdjustment(false);
    setActiveFilter("all");
  }

  function undoImport(batchId) {
    const batch = (appData.importBatches || []).find(item => item.id === batchId);
    if (!batch) return;

    const ok = window.confirm(buildUndoMessage(batch));
    if (!ok) return;

    const result = undoCsvImport(appData, batchId);
    actions.updateAppData(result.data, { major: true, reason: "CSV import undone" });
    setStatus(`Undone import: removed ${result.result.removedTransactions} transaction(s), unlinked ${result.result.unlinkedTransactions} matched transaction(s), and removed ${result.result.removedAdjustments} adjustment(s).`);
  }

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Import</p>
          <h2>Bank CSV import</h2>
          <p className="muted-text">Import real bank rows, match planned payments, link account transfers, avoid duplicates, and reconcile balances.</p>
        </div>
      </div>

      <section className="card import-workflow-card">
        <div className="section-header compact-header">
          <div>
            <h3>1. Upload statement CSV</h3>
            <p className="muted-text">Choose the Guinness & Holley Budgeting account first. The CSV is treated as a statement for that account.</p>
          </div>
          <span className="pill">V2.2</span>
        </div>

        <div className="form-grid import-setup-grid">
          <label>
            CSV belongs to account
            <select value={selectedAccountId} onChange={event => handleStatementAccountChange(event.target.value)}>
              {activeAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
              <option value={ADD_ACCOUNT_VALUE}>+ Add new account</option>
            </select>
          </label>

          <label>
            CSV file
            <input type="file" accept=".csv,text/csv" onChange={handleFile} />
          </label>
        </div>

        {fileName && <p className="muted-text">Loaded file: <strong>{fileName}</strong> · {rows.length} raw row(s)</p>}
        {status && <div className="import-status-box">{status}</div>}
      </section>

      {headers.length > 0 && (
        <section className="card import-workflow-card">
          <div className="section-header compact-header">
            <div>
              <h3>2. Map columns</h3>
              <p className="muted-text">Auto-detected values are only a starting point. Change anything that looks wrong.</p>
            </div>
            <button className="primary-button" onClick={analyseImport}>Analyse import</button>
          </div>

          <div className="form-grid import-map-grid">
            <ColumnSelect label="Date" field="date" value={columnMap.date} headers={headers} update={updateColumnMap} required />
            <ColumnSelect label="Description" field="description" value={columnMap.description} headers={headers} update={updateColumnMap} required />
            <ColumnSelect label="Signed amount" field="amount" value={columnMap.amount} headers={headers} update={updateColumnMap} />
            <ColumnSelect label="Paid in" field="paidIn" value={columnMap.paidIn} headers={headers} update={updateColumnMap} />
            <ColumnSelect label="Paid out" field="paidOut" value={columnMap.paidOut} headers={headers} update={updateColumnMap} />
            <ColumnSelect label="Balance / closing balance" field="balance" value={columnMap.balance} headers={headers} update={updateColumnMap} />
          </div>
        </section>
      )}

      {analysis && (
        <>
          <section className="summary-grid import-summary-grid">
            <SummaryItem label="Rows found" value={analysis.totals.total} />
            <SummaryItem label="New" value={analysis.totals.newRows} />
            <SummaryItem label="Transfers" value={analysis.totals.transfers} />
            <SummaryItem label="Matched" value={analysis.totals.plannedMatches + analysis.totals.existingTransferMatches} />
            <SummaryItem label="Needs review" value={analysis.totals.needsReview} />
            <SummaryItem label="Large expenses" value={analysis.totals.largeExpenses || 0} />
          </section>

          <ImportAnalysisSummary analysis={analysis} />

          <section className="card import-workflow-card">
            <div className="section-header compact-header">
              <div>
                <h3>3. Balance reconciliation</h3>
                <p className="muted-text">If the CSV includes a balance, the app checks the bank balance at the correct date rather than blindly comparing to today.</p>
              </div>
            </div>
            <ReconciliationPreview
              appData={appData}
              analysis={analysis}
              rowEdits={rowEdits}
              createAdjustment={createAdjustment}
              setCreateAdjustment={setCreateAdjustment}
            />
          </section>

          <section className="table-card import-preview-card">
            <div className="import-preview-header">
              <div>
                <h3>4. Review rows before importing</h3>
                <p className="muted-text">Untick anything you do not want. Transfers need the other GH account selected before import.</p>
              </div>
              <button className="primary-button" onClick={confirmImport}>Confirm import</button>
            </div>

            <div className="import-filter-row">
              {previewFilters.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-chip ${activeFilter === key ? "active" : ""}`}
                  onClick={() => setActiveFilter(key)}
                >
                  {label} <span>{getFilterCount(analysis.rows, rowEdits, key)}</span>
                </button>
              ))}
            </div>

            <table className="import-preview-table">
              <thead>
                <tr>
                  <th>Import?</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Action</th>
                  <th>Type / category</th>
                  <th>Transfer account</th>
                  <th>Budget</th>
                  <th>Match / warning</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => {
                  const edit = getRowEdit(rowEdits, row);
                  const type = edit.type || row.type;
                  const action = edit.action || row.action;
                  const categoryOptions = type === "income" ? incomeCategories : expenseCategories;
                  const transferText = getTransferText(row, edit, selectedAccountId, appData.accounts);

                  return (
                    <tr key={row.id} className={row.warning ? "import-row-warning" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(edit.include ?? row.defaultInclude)}
                          onChange={event => updateRow(row.id, "include", event.target.checked)}
                        />
                      </td>
                      <td>{row.date}</td>
                      <td>
                        <strong>{row.description}</strong>
                        <small>{row.confidence} confidence</small>
                      </td>
                      <td className={row.signedAmount >= 0 ? "positive-text" : "negative-text"}>{getSignedDisplay(row)}</td>
                      <td>
                        <select value={action} onChange={event => updateRow(row.id, "action", event.target.value)}>
                          {getActionOptions(row).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="import-cell-stack">
                          <select value={type} onChange={event => updateRow(row.id, "type", event.target.value)}>
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
                            <option value="transfer">Transfer</option>
                          </select>
                          {type !== "transfer" && (
                            <select value={edit.categoryId || row.categoryId || ""} onChange={event => updateRow(row.id, "categoryId", event.target.value)}>
                              {categoryOptions.map(category => (
                                <option key={category.id} value={category.id}>{category.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td>
                        {type === "transfer" ? (
                          <div className="import-cell-stack">
                            <select value={edit.linkedAccountId || row.linkedAccountId || ""} onChange={event => handleTransferAccountChange(row, event.target.value)}>
                              <option value="">Choose other account</option>
                              {activeAccounts
                                .filter(account => account.id !== selectedAccountId)
                                .map(account => (
                                  <option key={account.id} value={account.id}>{account.name}</option>
                                ))}
                              <option value={ADD_ACCOUNT_VALUE}>+ Add new account</option>
                            </select>
                            {transferText && <small>{transferText}</small>}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {type === "expense" ? (
                          <label className={`checkbox-label import-exclude-toggle ${row.suggestedExcludeFromBudget ? "highlight" : ""}`}>
                            <input
                              type="checkbox"
                              checked={Boolean(edit.excludeFromBudget)}
                              onChange={event => updateRow(row.id, "excludeFromBudget", event.target.checked)}
                            />
                            <span>{edit.excludeFromBudget ? "Excluded" : "Counts"}</span>
                          </label>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <strong>{row.actionLabel}</strong>
                        {row.matchedTitle && <small>Matched to: {row.matchedTitle}</small>}
                        {row.plannedDate && row.plannedAmount !== null && (
                          <small>Planned {formatMoney(row.plannedAmount)} on {row.plannedDate} → actual {formatMoney(row.actualAmount)} on {row.actualDate}</small>
                        )}
                        {row.warning && <small className="danger-text">{row.warning}</small>}
                        {row.externalAccountName && <small>External account text: {row.externalAccountName}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className="card import-history-card">
        <div className="section-header compact-header">
          <div>
            <h3>Recent import history</h3>
            <p className="muted-text">Each import batch records imported, linked, skipped and reconciliation results.</p>
          </div>
        </div>

        {latestImportBatches.length === 0 ? (
          <p className="muted">No CSV imports yet.</p>
        ) : (
          <div className="archive-list">
            {latestImportBatches.map(batch => {
              const account = appData.accounts.find(item => item.id === batch.accountId);
              return (
                <div key={batch.id} className="archive-row import-history-row">
                  <div>
                    <strong>{batch.fileName}</strong>
                    <small>{account?.name || "Unknown account"} · {new Date(batch.importedAt).toLocaleString("en-GB")}</small>
                  </div>
                  <div className="archive-row-actions import-history-actions">
                    <span className="pill">{batch.importedRows} new</span>
                    <span className="pill transfer">{batch.linkedRows} linked</span>
                    <span className="pill expense">{batch.skippedRows} skipped</span>
                    <small>{batch.reconciliationStatus}</small>
                    <button className="secondary-button small" onClick={() => setDetailBatchId(batch.id)}>View details</button>
                    <button className="secondary-button small" onClick={() => undoImport(batch.id)}>Undo import</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {detailBatchId && (
        <ImportBatchDetailModal
          batch={(appData.importBatches || []).find(item => item.id === detailBatchId)}
          appData={appData}
          close={() => setDetailBatchId(null)}
          undoImport={undoImport}
        />
      )}

      {accountModal && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={saveNewAccount}>
            <div className="section-header">
              <div>
                <h2>Add account</h2>
                <p className="muted-text">Create the account now and use it immediately in this CSV import.</p>
              </div>
              <button type="button" className="icon-button" onClick={closeAccountModal}>×</button>
            </div>

            <div className="form-grid">
              <label>
                Account name
                <input
                  placeholder="Chase Savings, Monzo Current, Cash"
                  value={accountForm.name}
                  onChange={event => updateAccountForm("name", event.target.value)}
                />
              </label>

              <label>
                Account type
                <select
                  value={accountForm.type}
                  onChange={event => updateAccountForm("type", event.target.value)}
                >
                  <option value="current">Current account</option>
                  <option value="savings">Savings account</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other account</option>
                </select>
              </label>

              <label>
                Opening balance
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={accountForm.openingBalance}
                  onChange={event => updateAccountForm("openingBalance", event.target.value)}
                />
              </label>
            </div>

            <p className="muted-text">
              For transfer matching, an opening balance of 0 is normally fine unless this is a brand-new statement account you are adding.
            </p>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeAccountModal}>Cancel</button>
              <button className="primary-button">Add account</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function buildUndoMessage(batch) {
  const created = Number(batch.importedRows || batch.transactionIds?.length || 0);
  const linked = Number(batch.linkedRows || batch.linkedTransactionIds?.length || 0);
  const skipped = Number(batch.skippedRows || 0);
  const adjustment = batch.reconciliationAdjustmentId ? 1 : 0;

  return [
    `Undo import "${batch.fileName}"?`,
    "",
    "This will remove:",
    `- ${created} imported transaction/transfer row(s)`,
    `- ${adjustment} reconciliation adjustment(s)`,
    "",
    "This will not delete planned transactions that were only matched.",
    `It will unlink ${linked} matched row(s) and keep ${skipped} skipped row(s) skipped.`
  ].join("\n");
}

function ImportBatchDetailModal({ batch, appData, close, undoImport }) {
  if (!batch) return null;

  const account = appData.accounts.find(item => item.id === batch.accountId);
  const createdTransactions = (batch.transactionIds || [])
    .map(id => appData.transactions.find(transaction => transaction.id === id))
    .filter(Boolean);
  const linkedTransactions = (batch.linkedTransactionIds || [])
    .map(id => appData.transactions.find(transaction => transaction.id === id))
    .filter(Boolean);

  return (
    <div className="modal-backdrop">
      <div className="modal-card import-detail-modal">
        <div className="section-header">
          <div>
            <h2>Import batch details</h2>
            <p className="muted-text">{batch.fileName}</p>
          </div>
          <button type="button" className="icon-button" onClick={close}>×</button>
        </div>

        <div className="import-detail-grid">
          <p><span>Account</span><strong>{account?.name || "Unknown account"}</strong></p>
          <p><span>Imported</span><strong>{new Date(batch.importedAt).toLocaleString("en-GB")}</strong></p>
          <p><span>Total rows</span><strong>{batch.totalRows}</strong></p>
          <p><span>Created</span><strong>{batch.importedRows}</strong></p>
          <p><span>Linked</span><strong>{batch.linkedRows}</strong></p>
          <p><span>Skipped</span><strong>{batch.skippedRows}</strong></p>
          <p><span>CSV latest date</span><strong>{batch.latestCsvDate || "—"}</strong></p>
          <p><span>CSV closing balance</span><strong>{batch.csvClosingBalance === null || batch.csvClosingBalance === undefined ? "—" : formatMoney(batch.csvClosingBalance)}</strong></p>
          <p><span>Reconciliation</span><strong>{batch.reconciliationStatus || "—"}</strong></p>
          <p><span>Saved mapping</span><strong>{batch.headerSignature ? "Yes" : "No"}</strong></p>
        </div>

        <div className="two-column import-detail-lists">
          <div>
            <h4>Created transactions</h4>
            {createdTransactions.length === 0 ? <p className="muted">None.</p> : createdTransactions.slice(0, 8).map(transaction => (
              <div key={transaction.id} className="simple-row">
                <span>{transaction.date} · {transaction.title}</span>
                <strong>{formatMoney(transaction.amount)}</strong>
              </div>
            ))}
          </div>
          <div>
            <h4>Linked transactions</h4>
            {linkedTransactions.length === 0 ? <p className="muted">None.</p> : linkedTransactions.slice(0, 8).map(transaction => (
              <div key={transaction.id} className="simple-row">
                <span>{transaction.date} · {transaction.title}</span>
                <strong>{formatMoney(transaction.amount)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>Close</button>
          <button
            type="button"
            className="danger-button"
            onClick={() => { close(); undoImport(batch.id); }}
          >
            Undo this import
          </button>
        </div>
      </div>
    </div>
  );
}

function getTransferText(row, edit, selectedAccountId, accounts) {
  const linkedAccountId = edit.linkedAccountId || row.linkedAccountId;
  if (!linkedAccountId) return "Choose the other account or add a new one.";

  const uploadedAccount = accounts.find(account => account.id === selectedAccountId)?.name || "Selected account";
  const linkedAccount = accounts.find(account => account.id === linkedAccountId)?.name || "Other account";
  return row.signedAmount > 0
    ? `${linkedAccount} → ${uploadedAccount}`
    : `${uploadedAccount} → ${linkedAccount}`;
}

function ColumnSelect({ label, field, value, headers, update, required = false }) {
  return (
    <label>
      {label}{required ? " *" : ""}
      <select value={value || ""} onChange={event => update(field, event.target.value)}>
        <option value="">Not mapped</option>
        {headers.map(header => <option key={header} value={header}>{header}</option>)}
      </select>
    </label>
  );
}

function SummaryItem({ label, value }) {
  return (
    <section className="card summary-card">
      <p className="eyebrow">{label}</p>
      <h3>{value}</h3>
    </section>
  );
}

function SummaryLine({ label, value }) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
