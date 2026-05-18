import { useMemo, useState } from "react";
import {
  analyseCsvImport,
  applyCsvImport,
  parseCsvText,
  suggestColumnMap
} from "../services/csvImportService.js";
import { calculateAccountBalanceAtDate } from "../utils/calculations.js";
import { formatMoney } from "../utils/money.js";

const emptyColumnMap = {
  date: "",
  description: "",
  amount: "",
  paidIn: "",
  paidOut: "",
  balance: ""
};

function formatDate(value) {
  if (!value) return "—";
  return value;
}

function getRowEdit(rowEdits, row) {
  return rowEdits[row.id] || {};
}

function getPreviewValue(rowEdits, row, field) {
  const edit = getRowEdit(rowEdits, row);
  return edit[field] ?? row[field];
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

function ReconciliationPreview({ appData, analysis, createAdjustment, setCreateAdjustment }) {
  const reconciliation = analysis?.reconciliation;
  if (!reconciliation?.available) {
    return (
      <div className="import-reconciliation-box muted-box">
        <strong>Balance check unavailable</strong>
        <span>{reconciliation?.message || "Map a balance column if your CSV includes one."}</span>
      </div>
    );
  }

  const gbBalance = calculateAccountBalanceAtDate(appData, analysis.accountId, reconciliation.latestCsvDate);
  const difference = reconciliation.csvClosingBalance - gbBalance;
  const differenceIsZero = Math.abs(difference) < 0.005;

  return (
    <div className={`import-reconciliation-box ${differenceIsZero ? "ok" : "warning"}`}>
      <div>
        <strong>{differenceIsZero ? "Balance check matched" : "Balance check needs review"}</strong>
        <span>{reconciliation.message}</span>
      </div>

      <div className="import-balance-grid">
        <p><span>CSV date</span><strong>{formatDate(reconciliation.latestCsvDate)}</strong></p>
        <p><span>CSV balance</span><strong>{formatMoney(reconciliation.csvClosingBalance)}</strong></p>
        <p><span>GB balance at that date before import</span><strong>{formatMoney(gbBalance)}</strong></p>
        <p><span>Current difference before import</span><strong>{formatMoney(difference)}</strong></p>
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

export default function ImportPage({ appData, actions }) {
  const activeAccounts = appData.accounts.filter(account => account.isActive);
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccounts[0]?.id || "");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMap, setColumnMap] = useState(emptyColumnMap);
  const [analysis, setAnalysis] = useState(null);
  const [rowEdits, setRowEdits] = useState({});
  const [createAdjustment, setCreateAdjustment] = useState(false);
  const [status, setStatus] = useState("");

  const incomeCategories = useMemo(() => appData.categories.filter(category => category.type === "income" && category.isActive), [appData.categories]);
  const expenseCategories = useMemo(() => appData.categories.filter(category => category.type === "expense" && category.isActive), [appData.categories]);
  const latestImportBatches = (appData.importBatches || []).slice(0, 5);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("");
    setAnalysis(null);
    setRowEdits({});
    setCreateAdjustment(false);

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
      setColumnMap({ ...emptyColumnMap, ...suggestColumnMap(parsed.headers) });
      const ignoredRowsText = parsed.ignoredTopRows > 0 ? ` Ignored ${parsed.ignoredTopRows} statement title/header note row(s).` : "";
      setStatus(`Loaded ${parsed.rows.length} CSV transaction row(s).${ignoredRowsText} Check the column mapping, then analyse.`);
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

  function analyseImport() {
    if (!selectedAccountId) return setStatus("Choose the GB account this CSV belongs to.");
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
        matchTransactionId: row.matchTransactionId || ""
      };
    });

    setAnalysis(nextAnalysis);
    setRowEdits(initialEdits);
    setCreateAdjustment(false);
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
      setStatus("One or more selected transfers needs the other GB account choosing first.");
      return;
    }

    const result = applyCsvImport(appData, analysis, rowEdits, {
      createReconciliationAdjustment: createAdjustment
    });

    actions.updateAppData(result.data);
    setStatus(`Import complete: ${result.result.importedTransactionIds.length} new, ${result.result.linkedTransactionIds.length} linked, ${result.result.skippedRows.length} skipped.`);
    setAnalysis(null);
    setRows([]);
    setHeaders([]);
    setFileName("");
    setRowEdits({});
    setCreateAdjustment(false);
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
            <p className="muted-text">Choose the Guinness Budgeting account first. The CSV is treated as a statement for that account.</p>
          </div>
          <span className="pill">V2.0</span>
        </div>

        <div className="form-grid import-setup-grid">
          <label>
            CSV belongs to account
            <select value={selectedAccountId} onChange={event => { setSelectedAccountId(event.target.value); setAnalysis(null); }}>
              {activeAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
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
            <SummaryItem label="Included by default" value={analysis.totals.defaultIncluded} />
            <SummaryItem label="Transfers" value={analysis.totals.transfers} />
            <SummaryItem label="Planned matches" value={analysis.totals.plannedMatches} />
            <SummaryItem label="Duplicates" value={analysis.totals.duplicates} />
          </section>

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
              createAdjustment={createAdjustment}
              setCreateAdjustment={setCreateAdjustment}
            />
          </section>

          <section className="table-card import-preview-card">
            <div className="import-preview-header">
              <div>
                <h3>4. Review rows before importing</h3>
                <p className="muted-text">Untick anything you do not want. Transfers need the other GB account selected before import.</p>
              </div>
              <button className="primary-button" onClick={confirmImport}>Confirm import</button>
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
                  <th>Match / warning</th>
                </tr>
              </thead>
              <tbody>
                {analysis.rows.map(row => {
                  const edit = getRowEdit(rowEdits, row);
                  const type = edit.type || row.type;
                  const categoryOptions = type === "income" ? incomeCategories : expenseCategories;

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
                        <select value={edit.action || row.action} onChange={event => updateRow(row.id, "action", event.target.value)}>
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
                          <select value={edit.linkedAccountId || row.linkedAccountId || ""} onChange={event => updateRow(row.id, "linkedAccountId", event.target.value)}>
                            <option value="">Choose other account</option>
                            {activeAccounts
                              .filter(account => account.id !== selectedAccountId)
                              .map(account => (
                                <option key={account.id} value={account.id}>{account.name}</option>
                              ))}
                          </select>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <strong>{row.actionLabel}</strong>
                        {row.matchedTitle && <small>Matched to: {row.matchedTitle}</small>}
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
                <div key={batch.id} className="archive-row">
                  <div>
                    <strong>{batch.fileName}</strong>
                    <small>{account?.name || "Unknown account"} · {new Date(batch.importedAt).toLocaleString("en-GB")}</small>
                  </div>
                  <div>
                    <span className="pill">{batch.importedRows} new</span>{" "}
                    <span className="pill transfer">{batch.linkedRows} linked</span>{" "}
                    <span className="pill expense">{batch.skippedRows} skipped</span>
                    <small>{batch.reconciliationStatus}</small>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
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
