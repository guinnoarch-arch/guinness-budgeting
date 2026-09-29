import { Fragment, useMemo, useState } from "react";
import {
  analyseCsvImport,
  applyCsvImport,
  parseCsvText,
  suggestColumnMap,
  undoCsvImport,
  findSavedCsvColumnMapping,
  forgetTransferGuess,
  describeTextMatch,
  combineCsvAnalyses,
  applyMultiCsvImport,
  minutesBetween,
  buildCsvBalanceTimeline,
  alignAccountToCsvTimeline,
  diagnoseCsvBalanceGaps,
  compareCsvOverlapWithApp,
  getPriorImportCoverageForAccount,
  planReplacePeriod,
  applyReplacePlans
} from "../services/csvImportService.js";
import { calculateAccountBalance, calculateAccountBalanceAtDate } from "../utils/calculations.js";
import { createId } from "../utils/ids.js";
import { formatMoney } from "../utils/money.js";

const ADD_ACCOUNT_VALUE = "__add_account__";

const emptyColumnMap = {
  date: "",
  time: "",
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
  ["unticked", "Unticked"],
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
  if (filter === "unticked") return !(getRowEdit(rowEdits, row).include ?? row.defaultInclude);
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
    const signedAmount = Number(edit.amount ?? row.amount) * (row.signedAmount < 0 ? -1 : 1);
    // Linking to an existing transfer still creates this account's own leg,
    // so it moves this account's balance like any new row.
    if (action === "duplicate") return;

    if (action === "match_planned" && row.matchTransactionId) {
      const existing = appData.transactions.find(transaction => transaction.id === row.matchTransactionId);
      if (existing) {
        const previousSigned = getSignedAmountForAccount(existing, accountId, cutoffDate);
        projected -= previousSigned;
      }
      projected += signedAmount;
      return;
    }

    if (type === "income" || type === "expense" || type === "transfer") {
      projected += signedAmount;
    }
  });

  return projected;
}

function getSignedAmountForAccount(transaction, accountId, cutoffDate) {
  if (!transaction || !accountId || !transaction.date || transaction.date > cutoffDate) return 0;
  if (transaction.accountId !== accountId) return 0;
  if (transaction.type === "income") return Number(transaction.amount || 0);
  if (transaction.type === "expense") return -Number(transaction.amount || 0);
  return 0;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

const TRUST_CSV_STORAGE_KEY = "gb.csvImport.trustCsvBalance";

// "The CSV is always right" is the default: on import, any gap between the
// app's calculated balance and the bank's is closed with dated adjustments.
// Remembered per browser so turning it off sticks.
function readTrustCsvPreference() {
  try {
    const stored = window.localStorage.getItem(TRUST_CSV_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function writeTrustCsvPreference(value) {
  try {
    window.localStorage.setItem(TRUST_CSV_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Storage blocked — the choice just won't be remembered.
  }
}

// One authoritative day-by-day balance timeline per account, merging every
// statement for that account in this import (newest statement wins where
// they overlap).
function getAccountTimelines(analysis) {
  const files = analysis?.files || [];
  const accountIds = [...new Set(files.map(fileAnalysis => fileAnalysis.accountId))];
  return accountIds
    .map(accountId => ({ accountId, timeline: buildCsvBalanceTimeline(files.filter(fileAnalysis => fileAnalysis.accountId === accountId)) }))
    .filter(item => item.timeline.length > 0);
}

// This account's CSV rows with the user's edits applied, in the shape
// diagnoseCsvBalanceGaps() expects.
function buildDiagnosisRows(analysis, rowEdits, accountId) {
  return (analysis?.rows || [])
    .filter(row => (row.sourceAccountId || analysis.accountId) === accountId)
    .map(row => {
      const edit = getRowEdit(rowEdits, row);
      const include = edit.include ?? row.defaultInclude;
      const action = edit.action || row.action;
      const amount = Number(edit.amount ?? row.amount);
      const status = action === "duplicate"
        ? (row.overlapDuplicateOf ? "overlap_duplicate" : "duplicate")
        : include ? "imported" : "unticked";
      return {
        id: row.id,
        date: edit.date || row.date,
        signedAmount: amount * (row.signedAmount < 0 ? -1 : 1),
        description: edit.description || row.description,
        sourceRowHash: row.sourceRowHash,
        fileId: row.fileId ?? null,
        fileName: row.sourceFileName || analysis.fileName,
        status,
        likelyClearedPending: Boolean(row.likelyClearedPending)
      };
    });
}

function signedMoney(value) {
  const amount = Number(value || 0);
  return `${amount >= 0 ? "+" : "-"}${formatMoney(Math.abs(amount))}`;
}

function describeRowStatus(status) {
  if (status === "unticked") return "unticked, so not being imported";
  if (status === "duplicate") return "marked as a duplicate of something already saved";
  if (status === "overlap_duplicate") return "skipped as it's on the newer statement";
  return "being imported";
}

function ReconciliationPreview({ appData, analysis, rowEdits, trusted }) {
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
        <small className="muted-text">
          {trusted
            ? "The CSV will be trusted on import: any gap left after the rows go in is closed with dated adjustments. Use \"Preview projected balances\" → \"Diagnose problem\" to see exactly where the gap comes from first."
            : "The CSV isn't being trusted for this account, so the calculated balance will be kept even if it doesn't match."}
        </small>
      )}
    </div>
  );
}

// Shared by the pre-import "Preview projected balances" check (mode
// "preview", runs the import against a throwaway copy of the data — nothing
// is saved) and the post-import result (mode "result", what actually got
// saved). Same shape either way: verifyImportBalances() output. The preview
// also gets the projected data itself, which "Diagnose problem" walks day by
// day against the CSV's own balances, and the per-account "Trust the CSV"
// switch.
function BalanceVerificationPanel({ verification, mode, analysis, rowEdits, appData, projectedData, isTrusted, onSetTrusted, onFixOpeningBalance }) {
  const [diagnosing, setDiagnosing] = useState(false);
  if (!verification) return null;

  const heading = mode === "preview"
    ? `Projected balance check (not yet imported)`
    : `Balance check against the CSV${verification.length > 1 ? "s" : ""}`;

  const hasMismatch = verification.some(item => !item.matches);
  const canDiagnose = mode === "preview" && hasMismatch && analysis && appData && projectedData;
  const visibleVerification = diagnosing ? verification.filter(item => !item.matches) : verification;
  const timelines = diagnosing ? getAccountTimelines(analysis) : [];

  return (
    <div className={`import-verification-panel ${mode === "preview" ? "preview" : ""}`}>
      <div className="import-verification-heading-row">
        <strong>{heading}</strong>
        {canDiagnose && (
          <button type="button" className="secondary-button small" onClick={() => setDiagnosing(value => !value)}>
            {diagnosing ? "Show all accounts" : "Diagnose problem"}
          </button>
        )}
      </div>
      {diagnosing && <small className="muted-text">Showing only the accounts that don't balance yet — hidden: {verification.length - visibleVerification.length} that already match.</small>}
      {visibleVerification.map(item => {
        const trusted = mode === "preview" && !item.matches && isTrusted?.(item.accountId);
        const timeline = diagnosing ? timelines.find(entry => entry.accountId === item.accountId)?.timeline : null;
        const diagnosisRows = timeline ? buildDiagnosisRows(analysis, rowEdits, item.accountId) : [];
        const diagnosis = timeline
          ? diagnoseCsvBalanceGaps(projectedData, item.accountId, timeline, diagnosisRows, {
              priorCoverage: getPriorImportCoverageForAccount(appData, item.accountId)
            })
          : null;
        // Compared against appData (before this import), so the right-hand
        // side is exactly what the app already had for those days.
        const overlap = timeline ? compareCsvOverlapWithApp(appData, item.accountId, timeline, diagnosisRows) : null;
        const adjustmentTotal = (item.trustAdjustments || []).reduce((total, adjustment) => total + Number(adjustment.amount || 0), 0);
        const rowState = item.matches ? "ok" : trusted ? "trusted" : "mismatch";

        return (
          <div key={item.accountId} className={`import-verification-row ${rowState}`}>
            <span>{item.matches ? "✓" : trusted ? "⇄" : "✗"} {item.accountName}</span>
            <span>
              {formatMoney(item.calculatedBalance)} {mode === "preview" ? "projected" : "calculated"}
              {item.matches ? "" : ` vs ${formatMoney(item.csvBalance)} on the CSV (as of ${item.asOfDate})`}
            </span>
            {mode === "result" && item.trustAdjustments?.length > 0 && (
              <small>
                CSV trusted: {item.trustAdjustments.length} adjustment{item.trustAdjustments.length === 1 ? "" : "s"} added ({item.trustAdjustments.map(adjustment => `${signedMoney(adjustment.amount)} on ${adjustment.date}`).join(", ")}) so the account matches the bank.
              </small>
            )}
            {trusted && (
              <small>
                CSV trusted — on import {item.trustAdjustments.length} dated adjustment{item.trustAdjustments.length === 1 ? "" : "s"} ({signedMoney(adjustmentTotal)} in total) will be added so it ends at {formatMoney(item.csvBalance)}.
              </small>
            )}
            {mode === "preview" && !item.matches && onSetTrusted && (diagnosing || !trusted) && (
              <span className="import-diagnosis-fix-row">
                <button
                  type="button"
                  className={trusted ? "secondary-button small" : "primary-button small"}
                  onClick={() => onSetTrusted(item.accountId, !trusted)}
                >
                  {trusted ? "Don't trust the CSV — keep the calculated balance" : `Trust the CSV (use ${formatMoney(item.csvBalance)})`}
                </button>
              </span>
            )}
            {diagnosis && <DiagnosisDetails diagnosis={diagnosis} overlap={overlap} accountId={item.accountId} onFixOpeningBalance={onFixOpeningBalance} />}
          </div>
        );
      })}
      {hasMismatch && (
        <small>
          A mismatch usually means a transaction on the statement wasn't imported, was imported twice, a pending payment cleared after a statement was downloaded, or an opening balance needs adjusting.
          {mode === "preview"
            ? ' "Diagnose problem" shows the exact day it goes out. "Trust the CSV" makes the account match the bank anyway.'
            : " Check the account's transaction list against the raw CSV for that date."}
        </small>
      )}
    </div>
  );
}

function DiagnosisDetails({ diagnosis, overlap, accountId, onFixOpeningBalance }) {
  const startIsOut = Math.abs(diagnosis.startGap) >= 0.005;
  const nothingChanges = diagnosis.changedDays.length === 0;
  // Opened straight away when the statement is already out on its first
  // day — that's exactly when seeing the shared days side by side helps.
  const [showOverlap, setShowOverlap] = useState(startIsOut);

  return (
    <div className="import-diagnosis-box">
      <span>
        Out on <strong>{diagnosis.daysOut}</strong> of {diagnosis.totalDays} statement day{diagnosis.totalDays === 1 ? "" : "s"} ({diagnosis.firstDate} to {diagnosis.lastDate}), compared end of day against the bank's own balance.
      </span>

      {startIsOut && (
        <div className="import-diagnosis-section">
          <strong>Already out before the statement starts</strong>
          <span>
            Just before {diagnosis.firstDate} the app has {formatMoney(diagnosis.ghBefore)}, but the bank's balance implies {formatMoney(diagnosis.csvBefore)} (the app is {formatMoney(Math.abs(diagnosis.ghBefore - diagnosis.csvBefore))} {diagnosis.ghBefore > diagnosis.csvBefore ? "higher" : "lower"}). That comes from the account's opening balance or something dated before this statement, not from these rows.
          </span>
          {diagnosis.canFixOpeningBalance && onFixOpeningBalance && (
            <span className="import-diagnosis-fix-row">
              <button type="button" className="secondary-button small" onClick={() => onFixOpeningBalance(accountId, diagnosis.impliedOpeningBalance)}>
                Set opening balance to {formatMoney(diagnosis.impliedOpeningBalance)}
              </button>
            </span>
          )}
        </div>
      )}

      {diagnosis.changedDays.map(day => (
        <div key={day.date} className="import-diagnosis-section">
          <strong>{day.date}: gap moves by {signedMoney(day.change)}</strong>
          <span>End of day the app has {formatMoney(day.ghBalance)}, the bank ({day.fileName}) has {formatMoney(day.csvBalance)}.</span>
          {day.missingFromApp.length > 0 && (
            <>
              <span className="import-diagnosis-label">On the CSV but not in the app:</span>
              <ul>
                {day.missingFromApp.map(row => (
                  <li key={row.id}>{row.description} · {signedMoney(row.signedAmount)} — {describeRowStatus(row.status)}</li>
                ))}
              </ul>
            </>
          )}
          {day.notOnCsv.length > 0 && (
            <>
              <span className="import-diagnosis-label">In the app but not on the CSV:</span>
              <ul>
                {day.notOnCsv.map(item => (
                  <li key={item.id}>
                    {item.kind === "adjustment" ? "Balance adjustment" : item.title} · {signedMoney(item.signedAmount)}
                    {item.kind === "adjustment" ? " — an earlier reconciliation adjustment" : item.fromBank ? " — from an earlier import (maybe a different date or wording there)" : " — added manually or planned, not from a bank statement"}
                  </li>
                ))}
              </ul>
            </>
          )}
          {day.missingFromApp.length === 0 && day.notOnCsv.length === 0 && (
            <span>Every row that day is accounted for, so an amount was probably edited, or a matched planned/transfer item has a different amount.</span>
          )}
        </div>
      ))}
      {diagnosis.moreChangedDays > 0 && <span>…and {diagnosis.moreChangedDays} more day(s) where the gap moves.</span>}
      {!startIsOut && nothingChanges && (
        <span>No single day explains it — check rows dated after the last statement day.</span>
      )}

      {overlap && (
        <div className="import-diagnosis-section">
          <strong>Overlap with what's already in the app</strong>
          <span>
            The app is up to date to <strong>{overlap.appLatestDate}</strong> and this CSV starts on <strong>{overlap.startDate}</strong>, so {overlap.startDate} to {overlap.endDate} is in both.
            {" "}{overlap.problemDays === 0 ? "Every shared day lines up." : `${overlap.problemDays} shared day(s) don't line up.`}
          </span>
          <span className="import-diagnosis-fix-row">
            <button type="button" className="secondary-button small" onClick={() => setShowOverlap(value => !value)}>
              {showOverlap ? "Hide side-by-side" : "Compare side by side"}
            </button>
          </span>
          {showOverlap && <OverlapComparison overlap={overlap} />}
        </div>
      )}

      {diagnosis.overlapDifferences.length > 0 && (
        <div className="import-diagnosis-section">
          <strong>Overlapping statements disagree</strong>
          <ul>
            {diagnosis.overlapDifferences.map(item => (
              <li key={`${item.date}_${item.otherFileName}`}>
                {item.date}: {item.fileName} says {formatMoney(item.balance)}, {item.earlierImport ? `your earlier import "${item.otherFileName}"` : item.otherFileName} said {formatMoney(item.otherBalance)} ({signedMoney(item.difference)}).
              </li>
            ))}
          </ul>
          <span>That's what a pending payment looks like: the older download didn't include it yet. The newer statement is the one used.</span>
        </div>
      )}

      {diagnosis.likelyPendingRows.length > 0 && (
        <div className="import-diagnosis-section">
          <strong>Probably pending last time, now cleared</strong>
          <ul>
            {diagnosis.likelyPendingRows.map(row => (
              <li key={row.id}>{row.date} · {row.description} · {signedMoney(row.signedAmount)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Bank CSV on the left, what the app already had on the right, one block per
// shared day, with each day's two end-of-day balances in its header.
function OverlapComparison({ overlap }) {
  const [problemsOnly, setProblemsOnly] = useState(false);
  const days = problemsOnly
    ? overlap.days.filter(day => Math.abs(day.gap) >= 0.005 || day.onlyCsv.length > 0 || day.onlyApp.length > 0)
    : overlap.days;

  return (
    <div className="import-overlap-compare">
      <label className="checkbox-label">
        <input type="checkbox" checked={problemsOnly} onChange={event => setProblemsOnly(event.target.checked)} />
        Only show days that don't line up
      </label>
      {overlap.truncatedDays > 0 && <small className="muted-text">Showing the last {overlap.days.length} shared days ({overlap.truncatedDays} earlier ones hidden).</small>}
      <div className="import-overlap-grid import-overlap-head">
        <span>Bank CSV</span>
        <span>In the app now</span>
      </div>
      {days.map(day => {
        const dayOk = Math.abs(day.gap) < 0.005 && day.onlyCsv.length === 0 && day.onlyApp.length === 0;
        return (
          <div key={day.date} className={`import-overlap-day ${dayOk ? "ok" : "problem"}`}>
            <div className="import-overlap-grid import-overlap-day-header">
              <span><strong>{day.date}</strong> · end of day {formatMoney(day.csvBalance)}</span>
              <span>
                end of day {formatMoney(day.appBalance)}
                {dayOk ? " ✓" : Math.abs(day.gap) >= 0.005 ? <span className="import-overlap-gap"> ({signedMoney(day.gap)})</span> : ""}
              </span>
            </div>
            {day.pairs.map(pair => (
              <div key={pair.csv.id} className="import-overlap-grid">
                <OverlapCell description={pair.csv.description} amount={pair.csv.signedAmount} />
                <OverlapCell description={pair.app.kind === "adjustment" ? "Balance adjustment" : pair.app.title} amount={pair.app.signedAmount} tag={pair.app.isTransfer ? "transfer" : ""} />
              </div>
            ))}
            {day.onlyCsv.map(row => (
              <div key={row.id} className="import-overlap-grid">
                <OverlapCell
                  description={row.description}
                  amount={row.signedAmount}
                  flag
                  note={row.possiblyDatedDifferently
                    ? `In the app on ${row.possiblyDatedDifferently} instead`
                    : row.status === "imported" ? "Not in the app yet — this import adds it" : `Not in the app — ${describeRowStatus(row.status)}`}
                />
                <span className="import-overlap-empty">—</span>
              </div>
            ))}
            {day.onlyApp.map(item => (
              <div key={item.id} className="import-overlap-grid">
                <span className="import-overlap-empty">—</span>
                <OverlapCell
                  description={item.kind === "adjustment" ? "Balance adjustment" : item.title}
                  amount={item.signedAmount}
                  tag={item.isTransfer ? "transfer" : ""}
                  flag
                  note={item.possiblyDatedDifferently
                    ? `On the CSV on ${item.possiblyDatedDifferently} instead`
                    : item.kind === "adjustment" ? "Earlier balance adjustment, not a bank row" : item.fromBank ? "Not on this CSV — check the earlier import" : "Added manually or planned, not on the bank statement"}
                />
              </div>
            ))}
            {day.pairs.length === 0 && day.onlyCsv.length === 0 && day.onlyApp.length === 0 && (
              <div className="import-overlap-grid"><span className="import-overlap-empty">No transactions</span><span className="import-overlap-empty">No transactions</span></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OverlapCell({ description, amount, tag = "", flag = false, note = "" }) {
  return (
    <span className={`import-overlap-cell ${flag ? "flag" : ""}`}>
      <span>{description}{tag && <em> · {tag}</em>}</span>
      <strong className={amount >= 0 ? "positive-text" : "negative-text"}>{signedMoney(amount)}</strong>
      {note && <small>{note}</small>}
    </span>
  );
}

// The date range each account's statement(s) cover in this import.
function getAccountRanges(analysis) {
  const ranges = new Map();
  (analysis?.files || []).forEach(fileAnalysis => {
    const from = fileAnalysis.firstCsvDate;
    const to = fileAnalysis.reconciliation?.latestCsvDate || fileAnalysis.firstCsvDate;
    if (!from || !to) return;
    const current = ranges.get(fileAnalysis.accountId);
    ranges.set(fileAnalysis.accountId, {
      accountId: fileAnalysis.accountId,
      fromDate: current && current.fromDate < from ? current.fromDate : from,
      toDate: current && current.toDate > to ? current.toDate : to
    });
  });
  return [...ranges.values()];
}

// Saves what a "replace this period" import cleared out onto that account's
// import batch (the last one, if several statements were for it), so Undo
// import can put it all back.
function attachReplacedData(data, batches, replacedByAccount) {
  const accountIds = Object.keys(replacedByAccount || {});
  if (!accountIds.length) return data;
  const batchIdByAccount = new Map();
  (batches || []).forEach(batch => batchIdByAccount.set(batch.accountId, batch.id));
  const batchReplaced = new Map();
  accountIds.forEach(accountId => {
    const batchId = batchIdByAccount.get(accountId) || batches?.at(-1)?.id;
    if (!batchId) return;
    const existing = batchReplaced.get(batchId) || { removedTransactions: [], changedTransactions: [], removedAdjustments: [] };
    const replaced = replacedByAccount[accountId];
    batchReplaced.set(batchId, {
      removedTransactions: [...existing.removedTransactions, ...(replaced.removedTransactions || [])],
      changedTransactions: [...existing.changedTransactions, ...(replaced.changedTransactions || [])],
      removedAdjustments: [...existing.removedAdjustments, ...(replaced.removedAdjustments || [])]
    });
  });
  return {
    ...data,
    importBatches: (data.importBatches || []).map(batch => batchReplaced.has(batch.id) ? { ...batch, replacedData: batchReplaced.get(batch.id) } : batch)
  };
}

function ReplacePeriodPanel({ range, accountName, appData, activePlan, editor, openEditor, updateEditor, applyEditor, stopReplacing }) {
  const plan = useMemo(
    () => planReplacePeriod(appData, range.accountId, range.fromDate, range.toDate),
    [appData, range.accountId, range.fromDate, range.toDate]
  );
  if (!plan.items.length && !activePlan) return null;

  const removingCount = activePlan ? activePlan.selectedIds.length + activePlan.selectedPartnerIds.length : 0;

  function toggle(setName, id, checked) {
    const next = new Set(editor[setName]);
    if (checked) next.add(id);
    else next.delete(id);
    updateEditor({ ...editor, [setName]: next });
  }

  return (
    <div className={`import-reconciliation-box ${activePlan ? "warning" : "muted-box"} import-replace-box`}>
      <div>
        <strong>{accountName}: {range.fromDate} to {range.toDate}</strong>
        {activePlan ? (
          <span>Replacing this period with the CSV: {removingCount} existing item(s) will be removed or put back to planned, then the CSV is imported fresh. Nothing is saved until Confirm import, and Undo import puts them back.</span>
        ) : (
          <span>The app already has {plan.items.length} item(s) for this account in these dates. Normally the CSV only adds what's missing, so anything wrong from an earlier import stays. Replace the period to rebuild it from this CSV instead.</span>
        )}
      </div>
      {!editor && (
        <span className="import-diagnosis-fix-row">
          <button type="button" className="secondary-button small" onClick={() => openEditor(range)}>
            {activePlan ? "Change what's replaced" : "Replace this period with the CSV…"}
          </button>
          {activePlan && <button type="button" className="secondary-button small" onClick={() => stopReplacing(range.accountId)}>Stop replacing</button>}
        </span>
      )}
      {editor && (
        <div className="import-replace-editor">
          <small className="muted-text">Ticked items are removed (planned items that an import matched go back to planned). Hand-entered items and reconcile adjustments start unticked — tick them if they're wrong.</small>
          {editor.plan.items.map(item => (
            <div key={item.id} className="import-replace-item">
              <label className="checkbox-label">
                <input type="checkbox" checked={editor.selectedIds.has(item.id)} onChange={event => toggle("selectedIds", item.id, event.target.checked)} />
                <span>
                  {item.date} · {item.title} · <strong className={item.signedAmount >= 0 ? "positive-text" : "negative-text"}>{signedMoney(item.signedAmount)}</strong>
                  <small className="muted"> — {item.source}</small>
                </span>
              </label>
              {item.partner && (
                <label className="checkbox-label import-replace-partner">
                  <input
                    type="checkbox"
                    disabled={!editor.selectedIds.has(item.id)}
                    checked={editor.selectedIds.has(item.id) && editor.selectedPartnerIds.has(item.partner.id)}
                    onChange={event => toggle("selectedPartnerIds", item.partner.id, event.target.checked)}
                  />
                  <span>
                    Also remove its other side in <strong>{item.partner.accountName}</strong>: {item.partner.date} · {item.partner.title} · {signedMoney(item.partner.signedAmount)}
                    <small className="muted"> — {item.partner.fromBank ? "from that account's bank statement; if kept it waits to be linked again" : "entered by hand, not from a bank statement"}</small>
                  </span>
                </label>
              )}
            </div>
          ))}
          <span className="import-diagnosis-fix-row">
            <button type="button" className="primary-button small" onClick={applyEditor}>Replace and re-check</button>
            <button type="button" className="secondary-button small" onClick={() => updateEditor(null)}>Cancel</button>
          </span>
        </div>
      )}
    </div>
  );
}

function BalanceChainCheckBox({ check, label }) {
  if (!check?.checked) {
    return (
      <div className="import-reconciliation-box muted-box">
        <strong>{label ? `${label}: running balance not checked` : "Running balance not checked"}</strong>
        <span>{check?.message || "Map a balance column to have the app verify its own maths against the bank's running balance."}</span>
      </div>
    );
  }

  return (
    <div className={`import-reconciliation-box ${check.reconciled ? "ok" : "warning"}`}>
      <div>
        <strong>{label ? `${label}: ` : ""}{check.reconciled ? "Running balance reconciles" : "Running balance doesn't add up"}</strong>
        <span>{check.message}</span>
      </div>
      {!check.reconciled && check.mismatches?.length > 0 && (
        <ul className="import-balance-chain-mismatches">
          {check.mismatches.map(mismatch => (
            <li key={`${mismatch.rowIndex}_${mismatch.date}`}>
              {mismatch.date} · {mismatch.description} — expected {formatMoney(mismatch.expectedBalance)}, CSV shows {formatMoney(mismatch.actualBalance)} ({mismatch.difference >= 0 ? "+" : ""}{formatMoney(mismatch.difference)})
            </li>
          ))}
        </ul>
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
  const [uploadItems, setUploadItems] = useState([]);
  const [expandedMappingId, setExpandedMappingId] = useState(null);
  const [multiRowEdits, setMultiRowEdits] = useState({});
  const [isMultiAnalysis, setIsMultiAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [rowEdits, setRowEdits] = useState({});
  const [trustCsvByDefault, setTrustCsvByDefault] = useState(readTrustCsvPreference);
  const [trustOverrides, setTrustOverrides] = useState({});
  // accountId -> { fromDate, toDate, selectedIds, selectedPartnerIds }: the
  // accounts whose statement period the CSV replaces rather than adds to.
  const [replacePlans, setReplacePlans] = useState({});
  const [replaceEditor, setReplaceEditor] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [importVerification, setImportVerification] = useState(null);
  const [previewProjection, setPreviewProjection] = useState(null);
  const [accountModal, setAccountModal] = useState(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [detailBatchId, setDetailBatchId] = useState(null);
  const [duplicateReviewRowId, setDuplicateReviewRowId] = useState(null);

  const incomeCategories = useMemo(() => (appData.categories || []).filter(category => category.type === "income" && category.isActive !== false), [appData.categories]);
  const expenseCategories = useMemo(() => (appData.categories || []).filter(category => category.type === "expense" && category.isActive !== false), [appData.categories]);
  const latestImportBatches = (appData.importBatches || []).slice(0, 5);
  const effectiveRowEdits = isMultiAnalysis ? multiRowEdits : rowEdits;
  const visibleRows = analysis ? analysis.rows.filter(row => rowMatchesFilter(row, effectiveRowEdits, activeFilter)) : [];
  // What the import is analysed and applied against: the real data, minus
  // whatever the chosen "replace this period" plans clear out. Nothing is
  // saved until Confirm import.
  const importBase = useMemo(() => applyReplacePlans(appData, Object.values(replacePlans)), [appData, replacePlans]);
  const baseData = importBase.data;
  const isAccountTrusted = accountId => trustOverrides[accountId] ?? trustCsvByDefault;
  // Derived rather than stored, so flipping "Trust the CSV" updates the
  // preview straight away without re-running the whole projection.
  const previewVerification = useMemo(() => {
    if (!previewProjection || !analysis) return null;
    const verification = buildPreviewVerification(previewProjection, analysis, isAccountTrusted);
    return verification.length > 0 ? verification : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewProjection, analysis, trustOverrides, trustCsvByDefault]);

  function setAccountTrusted(accountId, trusted) {
    setTrustOverrides(prev => ({ ...prev, [accountId]: trusted }));
  }

  function updateTrustCsvByDefault(value) {
    setTrustCsvByDefault(value);
    setTrustOverrides({});
    writeTrustCsvPreference(value);
  }

  function getTrustedAccountIds() {
    return new Set((analysis?.files || []).map(fileAnalysis => fileAnalysis.accountId).filter(isAccountTrusted));
  }

  async function handleFile(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setStatus("");
    setAnalysis(null);
    setMultiRowEdits({});
    setTrustOverrides({});
    setReplacePlans({});
    setReplaceEditor(null);
    setActiveFilter("all");

    try {
      const loaded = [];
      for (const file of files) {
        const text = await file.text();
        const parsed = parseCsvText(text);
        if (!parsed.headers.length || !parsed.rows.length) {
          loaded.push({
            id: createId("csvfile"),
            fileName: file.name,
            error: "Could not find a header row and transaction rows in this CSV.",
            headers: [],
            rows: [],
            columnMap: emptyColumnMap,
            accountId: activeAccounts[0]?.id || "",
            expanded: true
          });
          continue;
        }

        const savedMapping = findSavedCsvColumnMapping(appData, parsed.headers);
        const accountId = savedMapping?.accountId && activeAccounts.some(account => account.id === savedMapping.accountId)
          ? savedMapping.accountId
          : activeAccounts[0]?.id || "";

        loaded.push({
          id: createId("csvfile"),
          fileName: file.name,
          headers: parsed.headers,
          rows: parsed.rows,
          columnMap: savedMapping?.columnMap
            ? { ...emptyColumnMap, ...savedMapping.columnMap }
            : { ...emptyColumnMap, ...suggestColumnMap(parsed.headers, parsed.rows) },
          accountId,
          ignoredTopRows: parsed.ignoredTopRows || 0,
          savedMappingName: savedMapping?.name || savedMapping?.fileName || "",
          expanded: files.length === 1
        });
      }

      setUploadItems(prev => [...prev, ...loaded]);
      setExpandedMappingId(loaded[0]?.id || null);

      // Preserve the old single-file controls for compatibility with the rest of the page.
      if (loaded.length === 1 && loaded[0].headers.length) {
        const item = loaded[0];
        setFileName(item.fileName);
        setHeaders(item.headers);
        setRows(item.rows);
        setColumnMap(item.columnMap);
        setSelectedAccountId(item.accountId);
      }

      const usable = loaded.filter(item => item.rows.length);
      setStatus(`${usable.length} CSV file(s) loaded. Assign/check the account and mapping under each file, then analyse all files together.`);
    } catch (error) {
      console.error("CSV read failed:", error);
      setStatus("Could not read one or more CSV files.");
    } finally {
      event.target.value = "";
    }
  }

  function updateUploadItem(fileId, field, value) {
    setUploadItems(prev => prev.map(item => item.id === fileId ? { ...item, [field]: value } : item));
    setAnalysis(null);
    setReplacePlans({});
    setReplaceEditor(null);
  }

  function updateUploadItemMap(fileId, field, value) {
    setUploadItems(prev => prev.map(item => item.id === fileId
      ? { ...item, columnMap: { ...item.columnMap, [field]: value } }
      : item
    ));
    setAnalysis(null);
  }

  function removeUploadItem(fileId) {
    setUploadItems(prev => prev.filter(item => item.id !== fileId));
    setAnalysis(null);
    setReplacePlans({});
    setReplaceEditor(null);
    setMultiRowEdits({});
  }

  function toggleMapping(fileId) {
    setExpandedMappingId(prev => prev === fileId ? null : fileId);
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

  function analyseImport(baseOverride = null, plansOverride = null) {
    const base = baseOverride || baseData;
    const plans = plansOverride || replacePlans;
    const files = uploadItems.length
      ? uploadItems.filter(item => item.rows.length)
      : (rows.length ? [{
          id: "legacy_single",
          fileName,
          headers,
          rows,
          columnMap,
          accountId: selectedAccountId,
          ignoredTopRows: 0
        }] : []);

    if (!files.length) return setStatus("Add at least one CSV file first.");
    const invalid = files.find(item => !item.accountId || !item.columnMap.date || !item.columnMap.description || (!item.columnMap.amount && (!item.columnMap.paidIn || !item.columnMap.paidOut)));
    if (invalid) return setStatus(`Check the account and column mapping for "${invalid.fileName}".`);

    const analyses = files.map(item => ({
      ...analyseCsvImport(base, {
        accountId: item.accountId,
        fileName: item.fileName,
        headers: item.headers,
        rows: item.rows,
        columnMap: item.columnMap,
        replacedRange: plans[item.accountId] || null
      }),
      fileId: item.id,
      accountId: item.accountId
    }));

    // Give every preview row a globally unique id, identify likely cross-file
    // transfers, and order matched pairs next to each other for review. The
    // actual import re-checks these pairs against the transactions created by
    // earlier files, so only one transfer record is created.
    const orderedRows = combineCsvAnalyses(analyses);

    const initialEdits = {};
    orderedRows.forEach(row => {
      initialEdits[row.id] = {
        include: row.defaultInclude,
        action: row.action,
        type: row.type,
        categoryId: row.categoryId || "",
        linkedAccountId: row.linkedAccountId || "",
        matchTransactionId: row.matchTransactionId || "",
        excludeFromBudget: false,
        date: row.date,
        description: row.description,
        amount: row.amount
      };
    });

    setAnalysis({
      id: createId("analysis"),
      fileName: files.length === 1 ? files[0].fileName : `${files.length} CSV files`,
      accountId: files[0].accountId,
      headers: [],
      columnMap: null,
      createdAt: new Date().toISOString(),
      rows: orderedRows,
      totals: summariseCombinedAnalyses(analyses, orderedRows),
      reconciliation: files.length === 1 ? analyses[0].reconciliation : null,
      files: analyses,
      isMulti: files.length > 1
    });
    setImportVerification(null);
    setPreviewProjection(null);
    if (files.length > 1) {
      setMultiRowEdits(initialEdits);
      setRowEdits({});
    } else {
      setRowEdits(initialEdits);
      setMultiRowEdits({});
    }
    setIsMultiAnalysis(files.length > 1);
    setTrustOverrides({});
    setActiveFilter("all");
    setStatus(`Analysed ${orderedRows.length} transaction row(s) across ${files.length} CSV file(s). Transactions are ordered by date. Review transfers and duplicates before importing.`);
  }

  function updateRow(rowId, field, value) {
    if (isMultiAnalysis) {
      setMultiRowEdits(prev => ({
        ...prev,
        [rowId]: { ...(prev[rowId] || {}), [field]: value }
      }));
      return;
    }
    setRowEdits(prev => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [field]: value }
    }));
  }

  // Same amount + opposite sign can have more than one candidate (e.g. three
  // £300 rows: one income, two possible expense matches) — the greedy pairing
  // pass only ever picks one. When the user says a specific pairing is wrong,
  // look for another still-available row before giving up on the survivor,
  // rather than assuming it must be a standalone transaction too.
  function findAlternativeCrossFileMatch(survivor, rejectedPartnerId) {
    return (analysis?.rows || []).find(candidate => (
      candidate.id !== survivor.id
      && candidate.id !== rejectedPartnerId
      && candidate.sourceAccountId !== survivor.sourceAccountId
      && Math.abs(Number(candidate.signedAmount) + Number(survivor.signedAmount)) <= 0.005
      && minutesBetween(survivor.date, survivor.time, candidate.date, candidate.time) <= 3 * 24 * 60
      // Don't poach a row that's already confidently paired with someone else.
      && (!candidate.crossFileMatchId || candidate.crossFileMatchId === rejectedPartnerId)
    )) || null;
  }

  // The user is saying this specific row is not part of a transfer. Reset it
  // to its own best guess, then give the other half of the pair a chance to
  // find a different match instead of assuming it's wrong too — only fall
  // back to making it a standalone transaction if nothing else fits.
  function rejectCrossFileMatch(row) {
    const partner = analysis?.rows.find(item => item.id === row.crossFileMatchId);

    updateRow(row.id, "action", "new");
    updateRow(row.id, "type", row.baseType);
    updateRow(row.id, "linkedAccountId", "");
    updateRow(row.id, "categoryId", row.categoryId || "");
    updateRow(row.id, "include", true);
    // row is now confirmed not part of a transfer — clear the raw pairing
    // pointer too, not just the edit, so it doesn't keep showing this button
    // (which reads row.crossFileMatchId directly, not the edit) after it's
    // already resolved.
    row.crossFileMatchId = null;

    if (!partner) {
      setStatus("Marked that row as not a transfer.");
      return;
    }

    const alternative = findAlternativeCrossFileMatch(partner, row.id);

    if (alternative) {
      partner.crossFileMatchId = alternative.id;
      alternative.crossFileMatchId = partner.id;
      const { exactText, similarity } = describeTextMatch(partner.description, alternative.description);
      const hasEvidence = exactText || similarity >= 0.25;

      [[partner, alternative], [alternative, partner]].forEach(([target, other]) => {
        updateRow(target.id, "action", "new_transfer");
        updateRow(target.id, "type", "transfer");
        updateRow(target.id, "linkedAccountId", other.sourceAccountId);
        updateRow(target.id, "include", hasEvidence);
      });

      setStatus(`"${row.description}" marked as not a transfer. Found another possible match for "${partner.description}" (${alternative.sourceFileName}) — check it before importing.`);
    } else {
      partner.crossFileMatchId = null;
      updateRow(partner.id, "action", "new");
      updateRow(partner.id, "type", partner.baseType);
      updateRow(partner.id, "linkedAccountId", "");
      updateRow(partner.id, "categoryId", partner.categoryId || "");
      updateRow(partner.id, "include", true);
      setStatus(`"${row.description}" marked as not a transfer. No other match was found for "${partner.description}", so it's now a standalone transaction — check it below.`);
    }
  }

  // A guessed transfer with no matching transaction on the other side only
  // got its linked account from a keyword or a previously learned rule — if
  // it's wrong, reset this row back to its own best guess AND forget the
  // rule/mapping that caused it, so the same wrong guess doesn't keep
  // resurfacing on every future import that mentions this payee.
  function markRowNotATransfer(row) {
    updateRow(row.id, "action", "new");
    updateRow(row.id, "type", row.baseType);
    updateRow(row.id, "categoryId", row.categoryId || "");
    updateRow(row.id, "linkedAccountId", "");
    updateRow(row.id, "include", true);

    const uploadedAccountId = row.sourceAccountId || selectedAccountId;
    const { data: nextData, removedRuleCount, removedMappingCount } = forgetTransferGuess(appData, {
      accountId: uploadedAccountId,
      description: row.description,
      externalAccountName: row.externalAccountName
    });

    if (removedRuleCount > 0 || removedMappingCount > 0) {
      actions.updateAppData(nextData, { reason: "Forgot a learned transfer rule that was matching wrongly" });
      setStatus(`"${row.description}" won't be auto-suggested as a transfer again.`);
    } else {
      setStatus(`Marked "${row.description}" as not a transfer for this import.`);
    }
  }

  function openDuplicateReview(row) {
    setDuplicateReviewRowId(row.id);
  }

  function closeDuplicateReview() {
    setDuplicateReviewRowId(null);
  }

  function updateExistingDuplicate(transactionId, changes) {
    const nextTransactions = (appData.transactions || []).map(transaction => (
      transaction.id === transactionId
        ? { ...transaction, ...changes, updatedAt: new Date().toISOString() }
        : transaction
    ));
    actions.updateAppData({ ...appData, transactions: nextTransactions }, { reason: "Duplicate review: existing transaction edited" });
  }

  function keepExistingDuplicate(rowId) {
    updateRow(rowId, "include", false);
    updateRow(rowId, "action", "duplicate");
    setStatus("Kept the existing transaction. The imported row will be skipped.");
    closeDuplicateReview();
  }

  function useImportedDuplicate(row, importedValues, existingValues) {
    if (!row.duplicateTransactionId) return;

    const now = new Date().toISOString();
    const existing = appData.transactions.find(transaction => transaction.id === row.duplicateTransactionId);
    if (!existing) return;

    const updatedExisting = {
      ...existing,
      date: importedValues.date,
      amount: Number(importedValues.amount),
      title: importedValues.description || existing.title,
      type: importedValues.type,
      categoryId: importedValues.type === "expense" || importedValues.type === "income" ? importedValues.categoryId || existing.categoryId : null,
      accountId: existing.accountId,
      updatedAt: now
    };

    actions.updateAppData({
      ...appData,
      transactions: (appData.transactions || []).map(transaction => transaction.id === existing.id ? updatedExisting : transaction)
    }, { reason: "Duplicate review: imported details selected" });

    updateRow(row.id, "include", true);
    updateRow(row.id, "action", "match_planned");
    updateRow(row.id, "matchTransactionId", existing.id);
    updateRow(row.id, "type", importedValues.type);
    updateRow(row.id, "categoryId", importedValues.categoryId || "");
    updateRow(row.id, "date", importedValues.date);
    updateRow(row.id, "description", importedValues.description);
    updateRow(row.id, "amount", Number(importedValues.amount));
    setStatus("Imported details selected. The duplicate will be linked to the existing transaction when you confirm the import.");
    closeDuplicateReview();
  }

  // Applies a "Diagnose problem" opening-balance fix for real (this is the
  // one action in this whole preview flow that writes real data — everything
  // else stays a throwaway projection until Confirm import). The preview
  // check is now stale against the corrected account, so it's cleared and
  // the user is asked to re-run it rather than silently re-computed against
  // appData, which still holds this render's now-outdated value.
  function fixOpeningBalance(accountId, newOpeningBalance) {
    actions.updateAppData({
      ...appData,
      accounts: appData.accounts.map(account => (
        account.id === accountId
          ? { ...account, openingBalance: newOpeningBalance, updatedAt: new Date().toISOString() }
          : account
      ))
    }, { reason: "Corrected account opening balance from CSV import diagnosis" });
    setPreviewProjection(null);
    setStatus(`Opening balance updated to ${formatMoney(newOpeningBalance)}. Click "Preview projected balances" again to re-check.`);
  }

  // Runs the exact same import logic as Confirm import, against a throwaway
  // projection, so the resulting balances can be checked and troubleshot
  // *before* anything is actually saved. Nothing here is persisted — only
  // actions.updateAppData in confirmImport (and fixOpeningBalance above)
  // ever writes real data.
  // "Replace this period with the CSV": the plan is always built from the
  // real, saved data. Applying it re-runs the analysis against the cleared
  // data, which resets row edits — it's meant to be chosen before reviewing.
  function openReplaceEditor(range) {
    const plan = planReplacePeriod(appData, range.accountId, range.fromDate, range.toDate);
    const existing = replacePlans[range.accountId];
    setReplaceEditor({
      accountId: range.accountId,
      plan,
      selectedIds: new Set(existing ? existing.selectedIds : plan.items.filter(item => item.defaultSelected).map(item => item.id)),
      selectedPartnerIds: new Set(existing ? existing.selectedPartnerIds : plan.items.filter(item => item.partner?.defaultSelected).map(item => item.partner.id))
    });
  }

  function applyReplaceEditor() {
    if (!replaceEditor) return;
    const { plan } = replaceEditor;
    // A ticked "other side" only goes if its own item is going too.
    const selectedIds = [...replaceEditor.selectedIds];
    const selectedPartnerIds = plan.items
      .filter(item => item.partner && replaceEditor.selectedIds.has(item.id) && replaceEditor.selectedPartnerIds.has(item.partner.id))
      .map(item => item.partner.id);
    const nextPlans = { ...replacePlans };
    if (selectedIds.length) {
      nextPlans[plan.accountId] = { accountId: plan.accountId, fromDate: plan.fromDate, toDate: plan.toDate, selectedIds, selectedPartnerIds };
    } else {
      delete nextPlans[plan.accountId];
    }
    setReplacePlans(nextPlans);
    setReplaceEditor(null);
    analyseImport(applyReplacePlans(appData, Object.values(nextPlans)).data, nextPlans);
    setStatus(selectedIds.length
      ? `Replacing ${plan.fromDate} to ${plan.toDate}: ${selectedIds.length + selectedPartnerIds.length} item(s) will be removed and the CSV imported fresh. Nothing is saved until you confirm, and Undo import puts them back.`
      : "Nothing selected to replace, so the CSV will only add what's missing.");
  }

  function stopReplacing(accountId) {
    const nextPlans = { ...replacePlans };
    delete nextPlans[accountId];
    setReplacePlans(nextPlans);
    setReplaceEditor(null);
    analyseImport(applyReplacePlans(appData, Object.values(nextPlans)).data, nextPlans);
    setStatus("Stopped replacing — the CSV will only add what's missing for that account.");
  }

  // The projection deliberately leaves out "Trust the CSV" adjustments, so
  // the check and "Diagnose problem" show the real calculated gap; the
  // adjustments trusting would add are worked out on top of it (see
  // buildPreviewVerification).
  function previewImportResult() {
    if (!analysis) return;

    let projectedData;
    let missingTransferFileName = null;
    if (analysis.isMulti) {
      const validFileIds = new Set(uploadItems.map(item => item.id));
      ({ data: projectedData, missingTransferFileName } = applyMultiCsvImport(
        baseData, analysis.files, analysis.rows, multiRowEdits, validFileIds
      ));
    } else {
      projectedData = applyCsvImport(baseData, analysis, rowEdits, { trustCsvBalance: false }).data;
    }

    setPreviewProjection(projectedData);
    const verification = buildPreviewVerification(projectedData, analysis, isAccountTrusted);

    if (missingTransferFileName) {
      setStatus(`Preview stopped at "${missingTransferFileName}" — choose the other account for every selected transfer in that statement, then preview again.`);
      return;
    }
    const mismatched = verification.filter(item => !item.matches);
    setStatus(verification.length === 0
      ? "Preview ready, but no balance column was mapped, so projected balances can't be checked."
      : mismatched.length === 0
        ? "Preview: every account balance matches its CSV. Safe to import."
        : mismatched.every(item => isAccountTrusted(item.accountId))
          ? "Preview: the calculated balance doesn't match the CSV yet, but the CSV is trusted, so the import will make it match. Use \"Diagnose problem\" to see why first."
          : "Preview: some balances wouldn't match — see below. \"Diagnose problem\" finds the day it goes out; \"Trust the CSV\" uses the bank's figure anyway.");
  }

  function confirmImport() {
    if (!analysis) return;
    setPreviewProjection(null);
    const trustAccountIds = getTrustedAccountIds();
    const timelines = getAccountTimelines(analysis);

    if (analysis.isMulti) {
      const validFileIds = new Set(uploadItems.map(item => item.id));
      const { data: workingData, result: aggregate, missingTransferFileName } = applyMultiCsvImport(
        baseData, analysis.files, analysis.rows, multiRowEdits, validFileIds, { trustAccountIds }
      );

      if (missingTransferFileName) {
        setStatus(`Choose the other account for every selected transfer in "${missingTransferFileName}".`);
        setActiveFilter("needs_review");
        return;
      }

      const savedData = attachReplacedData(workingData, aggregate.batches, importBase.replacedByAccount);
      actions.updateAppData(savedData, { major: true, reason: "Multiple CSV imports completed", rulesTrigger: "import" });
      const verification = verifyImportBalances(workingData, timelines, groupAdjustmentsByAccount(aggregate.reconciliationAdjustments));
      setImportVerification(verification.length > 0 ? verification : null);
      setStatus(`Import complete: ${aggregate.batches.length} statement(s), ${aggregate.importedTransactionIds.length} new, ${aggregate.linkedTransactionIds.length} linked, ${aggregate.skippedRows.length} skipped${aggregate.reconciliationAdjustments.length ? `, ${aggregate.reconciliationAdjustments.length} balance adjustment(s) to match the CSV` : ""}.`);
      setAnalysis(null);
      setRows([]);
      setHeaders([]);
      setFileName("");
      setUploadItems([]);
      setMultiRowEdits({});
      setIsMultiAnalysis(false);
      setTrustOverrides({});
      setReplacePlans({});
      setReplaceEditor(null);
      setActiveFilter("all");
      return;
    }

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

    const result = applyCsvImport(baseData, analysis, rowEdits, {
      trustCsvBalance: trustAccountIds.has(analysis.accountId)
    });

    actions.updateAppData(
      attachReplacedData(result.data, [result.result.importBatch], importBase.replacedByAccount),
      { major: true, reason: "CSV import completed", rulesTrigger: "import" }
    );
    const adjustments = result.result.reconciliationAdjustments || [];
    const verification = verifyImportBalances(result.data, timelines, groupAdjustmentsByAccount(adjustments));
    setImportVerification(verification.length > 0 ? verification : null);
    setStatus(`Import complete: ${result.result.importedTransactionIds.length} new, ${result.result.linkedTransactionIds.length} linked, ${result.result.skippedRows.length} skipped${adjustments.length ? `, ${adjustments.length} balance adjustment(s) to match the CSV` : ""}.`);
    setAnalysis(null);
    setRows([]);
    setHeaders([]);
    setFileName("");
    setUploadItems([]);
    setRowEdits({});
    setMultiRowEdits({});
    setTrustOverrides({});
    setReplacePlans({});
    setReplaceEditor(null);
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
        </div>
      </div>

      <section className="card import-workflow-card">
        <div className="section-header compact-header">
          <div>
            <h3>1. Upload statement CSV</h3>
          </div>
          <span className="pill">V2.2</span>
        </div>

        <div className="form-grid import-setup-grid">
          <label>
            CSV file(s)
            <input type="file" accept=".csv,text/csv" multiple onChange={handleFile} />
          </label>
          {!uploadItems.length && (
            <label>
              Default account for a single CSV
              <select value={selectedAccountId} onChange={event => handleStatementAccountChange(event.target.value)}>
                {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                <option value={ADD_ACCOUNT_VALUE}>+ Add new account</option>
              </select>
            </label>
          )}
        </div>

        {uploadItems.length > 0 && (
          <div className="archive-list">
            {uploadItems.map(item => {
              const account = activeAccounts.find(accountItem => accountItem.id === item.accountId);
              const expanded = expandedMappingId === item.id;
              return (
                <div key={item.id} className="archive-row">
                  <div>
                    <strong>{item.fileName}</strong>
                    <small>{item.error || `${item.rows.length} row(s) · ${account?.name || "No account selected"}`}</small>
                  </div>
                  <div className="archive-row-actions">
                    {!item.error && <select value={item.accountId} onChange={event => updateUploadItem(item.id, "accountId", event.target.value)}>
                      {activeAccounts.map(accountOption => <option key={accountOption.id} value={accountOption.id}>{accountOption.name}</option>)}
                    </select>}
                    <button type="button" className="secondary-button small" onClick={() => toggleMapping(item.id)}>
                      {expanded ? "Hide mapping" : "Check mapping"}
                    </button>
                    <button type="button" className="secondary-button small" onClick={() => removeUploadItem(item.id)}>Remove</button>
                  </div>
                  {!item.error && expanded && (
                    <div className="import-mapping-dropdown">
                      <div className="form-grid import-map-grid">
                        <ColumnSelect label="Date" field="date" value={item.columnMap.date} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} required />
                        <ColumnSelect label="Time" field="time" value={item.columnMap.time} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                        <ColumnSelect label="Description" field="description" value={item.columnMap.description} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} required />
                        <ColumnSelect label="Signed amount" field="amount" value={item.columnMap.amount} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                        <ColumnSelect label="Paid in" field="paidIn" value={item.columnMap.paidIn} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                        <ColumnSelect label="Paid out" field="paidOut" value={item.columnMap.paidOut} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                        <ColumnSelect label="Balance / closing balance" field="balance" value={item.columnMap.balance} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {fileName && !uploadItems.length && <p className="muted-text">Loaded file: <strong>{fileName}</strong> · {rows.length} raw row(s)</p>}
        {status && <div className="import-status-box">{status}</div>}
        <BalanceVerificationPanel verification={importVerification} mode="result" />
        {uploadItems.length > 0 && <div className="modal-actions"><button type="button" className="primary-button" onClick={() => analyseImport()}>Analyse all CSVs</button></div>}
      </section>

      {headers.length > 0 && uploadItems.length === 0 && (
        <section className="card import-workflow-card">
          <div className="section-header compact-header">
            <div>
              <h3>2. Map columns</h3>
            </div>
            <button className="primary-button" onClick={() => analyseImport()}>Analyse import</button>
          </div>

          <div className="form-grid import-map-grid">
            <ColumnSelect label="Date" field="date" value={columnMap.date} headers={headers} update={updateColumnMap} required />
            <ColumnSelect label="Time" field="time" value={columnMap.time} headers={headers} update={updateColumnMap} />
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
                <h3>{analysis.isMulti ? "3. Review combined import" : "3. Balance reconciliation"}</h3>
              </div>
            </div>
            {analysis.isMulti ? (
              <>
                <div className="import-reconciliation-box muted-box">
                  <strong>Combined statement review</strong>
                  <span>The transaction review below combines all files and orders every row by date so transfers between accounts are easy to spot. Overlapping statements for the same account are merged: rows on both are only imported once (from the newer statement), and rows only on the newer one — usually payments that were still pending when the older one was downloaded — are kept.</span>
                </div>
                {analysis.files.map(fileAnalysis => (
                  <BalanceChainCheckBox key={fileAnalysis.id} check={fileAnalysis.balanceChainCheck} label={fileAnalysis.fileName} />
                ))}
              </>
            ) : (
              <>
                <BalanceChainCheckBox check={analysis.balanceChainCheck} />
                <ReconciliationPreview
                  appData={baseData}
                  analysis={analysis}
                  rowEdits={rowEdits}
                  trusted={isAccountTrusted(analysis.accountId)}
                />
              </>
            )}
            {getAccountRanges(analysis).map(range => (
              <ReplacePeriodPanel
                key={range.accountId}
                range={range}
                accountName={appData.accounts.find(account => account.id === range.accountId)?.name || "Account"}
                appData={appData}
                activePlan={replacePlans[range.accountId] || null}
                editor={replaceEditor?.accountId === range.accountId ? replaceEditor : null}
                openEditor={openReplaceEditor}
                updateEditor={setReplaceEditor}
                applyEditor={applyReplaceEditor}
                stopReplacing={stopReplacing}
              />
            ))}
          </section>

          <section className="table-card import-preview-card">
            <div className="import-preview-header">
              <div>
                <h3>{analysis.isMulti ? "4. Review all statements together" : "4. Review rows before importing"}</h3>
                <p className="muted-text">{analysis.isMulti ? "All statements are combined and sorted by date. Opposite-sign matches across accounts are highlighted as transfers." : "Untick anything you do not want. Transfers need the other GH account selected before import."}</p>
              </div>
              <div className="import-preview-header-actions">
                <button type="button" className="secondary-button" onClick={previewImportResult}>Preview projected balances</button>
                <button className="primary-button" onClick={confirmImport}>Confirm import</button>
              </div>
            </div>

            <label className="checkbox-label import-reconcile-toggle">
              <input
                type="checkbox"
                checked={trustCsvByDefault}
                onChange={event => updateTrustCsvByDefault(event.target.checked)}
              />
              Trust the CSV balance on import — if the calculated balance doesn't match the bank's, add dated adjustments so it does. (Can be changed per account under "Preview projected balances".)
            </label>

            <BalanceVerificationPanel
              verification={previewVerification}
              mode="preview"
              analysis={analysis}
              rowEdits={effectiveRowEdits}
              appData={baseData}
              projectedData={previewProjection}
              isTrusted={isAccountTrusted}
              onSetTrusted={setAccountTrusted}
              onFixOpeningBalance={fixOpeningBalance}
            />

            <div className="import-filter-row">
              {previewFilters.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-chip ${activeFilter === key ? "active" : ""}`}
                  onClick={() => setActiveFilter(key)}
                >
                  {label} <span>{getFilterCount(analysis.rows, effectiveRowEdits, key)}</span>
                </button>
              ))}
            </div>

            <table className="import-preview-table">
              <thead>
                <tr>
                  <th>Import?</th>
                  <th>Date</th>
                  {analysis.isMulti && <th>Statement / account</th>}
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
                {visibleRows.map((row, rowPosition) => {
                  const edit = getRowEdit(effectiveRowEdits, row);
                  const type = edit.type || row.type;
                  const action = edit.action || row.action;
                  const categoryOptions = type === "income" ? incomeCategories : expenseCategories;
                  const transferText = getTransferText(row, edit, selectedAccountId, appData.accounts);
                  const matchedTransaction = getMatchedTransactionInfo(row, edit, analysis, baseData, appData.accounts);
                  const displayDate = edit.date || row.date;
                  const displayDescription = edit.description || row.description;
                  const displayAmount = Number(edit.amount ?? row.amount);
                  const displaySignedAmount = displayAmount * (row.signedAmount < 0 ? -1 : 1);
                  const pairColor = (row.crossFileMatchId && type === "transfer") ? getConfidenceColor(row.confidence) : null;
                  const nextVisibleRow = visibleRows[rowPosition + 1];
                  const isFirstOfVisiblePair = Boolean(pairColor) && nextVisibleRow?.id === row.crossFileMatchId;
                  const mergeSelected = action === "match_existing_transfer";

                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`${row.warning ? "import-row-warning" : ""} ${pairColor ? "import-linked-row" : ""}`}
                        style={pairColor ? { borderLeft: `4px solid ${pairColor}` } : undefined}
                      >
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(edit.include ?? row.defaultInclude)}
                          onChange={event => updateRow(row.id, "include", event.target.checked)}
                        />
                      </td>
                      <td>{displayDate}{row.time && <small>{row.time}</small>}</td>
                      {analysis.isMulti && <td><small>{row.sourceFileName}</small><small>{appData.accounts.find(account => account.id === row.sourceAccountId)?.name || "Unknown account"}</small></td>}
                      <td>
                        <strong>{displayDescription}</strong>
                        <small style={{ color: getConfidenceColor(row.confidence), fontWeight: 600 }}>{row.confidence} confidence</small>
                      </td>
                      <td className={displaySignedAmount >= 0 ? "positive-text" : "negative-text"}>{displaySignedAmount >= 0 ? `+${formatMoney(displayAmount)}` : `-${formatMoney(displayAmount)}`}</td>
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
                                .filter(account => account.id !== (row.sourceAccountId || selectedAccountId))
                                .map(account => (
                                  <option key={account.id} value={account.id}>{account.name}</option>
                                ))}
                              <option value={ADD_ACCOUNT_VALUE}>+ Add new account</option>
                            </select>
                            {transferText && <small>{transferText}</small>}
                            {!row.crossFileMatchId && (
                              <button
                                type="button"
                                className="secondary-button small"
                                onClick={() => markRowNotATransfer(row)}
                                title="Reset this row to an ordinary transaction and forget any learned rule that guessed it as a transfer."
                              >
                                Not a transfer
                              </button>
                            )}
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
                        {row.infoNote && <small className="import-info-note">{row.infoNote}</small>}
                        {row.duplicateTransactionId && (
                          <button type="button" className="secondary-button small" onClick={() => openDuplicateReview(row)}>Compare duplicate</button>
                        )}
                        {row.externalAccountName && <small>External account text: {row.externalAccountName}</small>}
                        {matchedTransaction && (
                          <div className="import-matched-transaction-box" style={pairColor ? { borderColor: pairColor } : undefined}>
                            <strong>Matched transaction</strong>
                            <span>{matchedTransaction.date} · {matchedTransaction.description}</span>
                            <span>{matchedTransaction.signedAmount >= 0 ? "+" : "-"}{formatMoney(Math.abs(matchedTransaction.signedAmount))} · {matchedTransaction.accountName}</span>
                            {matchedTransaction.originalType && matchedTransaction.originalType !== "transfer" && (
                              <label className="import-matched-transaction-edit">
                                Currently saved as {matchedTransaction.originalType}.
                                <select
                                  value={mergeSelected ? "merge" : "keep"}
                                  onChange={event => {
                                    if (event.target.value === "keep") {
                                      updateRow(row.id, "action", "new");
                                      updateRow(row.id, "type", row.baseType);
                                    } else {
                                      updateRow(row.id, "action", "match_existing_transfer");
                                      updateRow(row.id, "type", "transfer");
                                    }
                                  }}
                                >
                                  <option value="merge">Merge into one transfer (recommended)</option>
                                  <option value="keep">Keep as {matchedTransaction.originalType}, don't merge</option>
                                </select>
                              </label>
                            )}
                            {row.crossFileMatchId && (
                              <button
                                type="button"
                                className="secondary-button small"
                                onClick={() => rejectCrossFileMatch(row)}
                                title="Mark this row as not a transfer. The other side will look for a different match before falling back to a standalone transaction."
                              >
                                ↻ Not this match
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      </tr>
                      {isFirstOfVisiblePair && (
                        <tr className="import-linked-connector-row">
                          <td colSpan={analysis.isMulti ? 10 : 9}>
                            <div className="import-linked-connector" style={{ borderColor: pairColor }}>
                              <span aria-hidden="true">⇅</span> Linked transfer — matched with the row below
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

      {duplicateReviewRowId && (
        <DuplicateReviewModal
          row={analysis?.rows.find(row => row.id === duplicateReviewRowId)}
          rowEdit={effectiveRowEdits[duplicateReviewRowId] || {}}
          existingTransaction={(appData.transactions || []).find(transaction => transaction.id === analysis?.rows.find(row => row.id === duplicateReviewRowId)?.duplicateTransactionId)}
          appData={appData}
          close={closeDuplicateReview}
          updateRow={updateRow}
          updateExistingDuplicate={updateExistingDuplicate}
          keepExisting={keepExistingDuplicate}
          useImported={useImportedDuplicate}
        />
      )}

      {accountModal && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={saveNewAccount}>
            <div className="section-header">
              <div>
                <h2>Add account</h2>
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
                  <option value="investment">Investment account</option>
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

function DuplicateReviewModal({ row, rowEdit, existingTransaction, appData, close, updateRow, updateExistingDuplicate, keepExisting, useImported }) {
  const [imported, setImported] = useState(() => ({
    date: row?.date || "",
    description: row?.description || "",
    amount: row?.amount ?? "",
    type: row?.baseType || row?.type || "expense",
    categoryId: row?.categoryId || ""
  }));
  const [existing, setExisting] = useState(() => ({
    date: existingTransaction?.date || "",
    title: existingTransaction?.title || "",
    amount: existingTransaction?.amount ?? "",
    type: existingTransaction?.type || "expense",
    categoryId: existingTransaction?.categoryId || ""
  }));

  if (!row || !existingTransaction) return null;

  const categories = (appData.categories || []).filter(category => category.isActive !== false && category.type === imported.type);
  const existingCategories = (appData.categories || []).filter(category => category.isActive !== false && category.type === existing.type);

  function saveExisting() {
    updateExistingDuplicate(existingTransaction.id, {
      date: existing.date,
      title: existing.title,
      amount: Number(existing.amount),
      type: existing.type,
      categoryId: existing.categoryId
    });
  }

  function chooseImported() {
    if (!imported.date || !imported.description || !Number(imported.amount)) return;
    updateRow(row.id, "date", imported.date);
    updateRow(row.id, "description", imported.description);
    updateRow(row.id, "amount", Number(imported.amount));
    updateRow(row.id, "type", imported.type);
    updateRow(row.id, "categoryId", imported.categoryId || "");
    useImported(row, imported, existing);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card import-duplicate-review-modal">
        <div className="section-header">
          <div>
            <h2>Compare possible duplicate</h2>
            <p className="muted-text">The import found an existing transaction with the same account, date, amount and similar description. Nothing is deleted automatically.</p>
          </div>
          <button type="button" className="icon-button" onClick={close}>×</button>
        </div>

        <div className="two-column">
          <section className="card">
            <h3>Imported statement row</h3>
            <div className="form-grid">
              <label>Date<input type="date" value={imported.date} onChange={event => setImported(prev => ({ ...prev, date: event.target.value }))} /></label>
              <label>Description<input value={imported.description} onChange={event => setImported(prev => ({ ...prev, description: event.target.value }))} /></label>
              <label>Amount<input type="number" step="0.01" value={imported.amount} onChange={event => setImported(prev => ({ ...prev, amount: event.target.value }))} /></label>
              <label>Type<select value={imported.type} onChange={event => setImported(prev => ({ ...prev, type: event.target.value, categoryId: "" }))}>
                <option value="expense">Expense</option><option value="income">Income</option>
              </select></label>
              <label>Category<select value={imported.categoryId} onChange={event => setImported(prev => ({ ...prev, categoryId: event.target.value }))}>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select></label>
            </div>
          </section>

          <section className="card">
            <h3>Existing transaction</h3>
            <div className="form-grid">
              <label>Date<input type="date" value={existing.date} onChange={event => setExisting(prev => ({ ...prev, date: event.target.value }))} /></label>
              <label>Description<input value={existing.title} onChange={event => setExisting(prev => ({ ...prev, title: event.target.value }))} /></label>
              <label>Amount<input type="number" step="0.01" value={existing.amount} onChange={event => setExisting(prev => ({ ...prev, amount: event.target.value }))} /></label>
              <label>Type<select value={existing.type} onChange={event => setExisting(prev => ({ ...prev, type: event.target.value, categoryId: "" }))}>
                <option value="expense">Expense</option><option value="income">Income</option>
              </select></label>
              <label>Category<select value={existing.categoryId} onChange={event => setExisting(prev => ({ ...prev, categoryId: event.target.value }))}>
                {existingCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select></label>
            </div>
            <button type="button" className="secondary-button small" onClick={saveExisting}>Save existing edits</button>
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => keepExisting(row.id)}>Keep existing</button>
          <button type="button" className="primary-button" onClick={chooseImported}>Use imported details</button>
        </div>
        <p className="muted-text">“Use imported details” keeps one transaction record, replaces its editable details with the statement row, and then links the imported bank row to it. It does not create a second transaction.</p>
      </div>
    </div>
  );
}

function buildUndoMessage(batch) {
  const created = Number(batch.importedRows || batch.transactionIds?.length || 0);
  const linked = Number(batch.linkedRows || batch.linkedTransactionIds?.length || 0);
  const skipped = Number(batch.skippedRows || 0);
  const adjustment = batch.reconciliationAdjustmentIds?.length || (batch.reconciliationAdjustmentId ? 1 : 0);

  return [
    `Undo import "${batch.fileName}"?`,
    "",
    "This will remove:",
    `- ${created} imported transaction/transfer row(s)`,
    `- ${adjustment} reconciliation adjustment(s)`,
    "",
    "This will not delete planned transactions that were only matched.",
    `It will unlink ${linked} matched row(s) and keep ${skipped} skipped row(s) skipped.`,
    ...(batch.replacedData ? [
      "",
      `This import replaced a period, so it will also put back ${(batch.replacedData.removedTransactions || []).length + (batch.replacedData.changedTransactions || []).length} transaction(s) and ${(batch.replacedData.removedAdjustments || []).length} adjustment(s) it removed or changed.`
    ] : [])
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

function getMatchedTransactionInfo(row, edit, analysis, appData, accounts) {
  const action = edit.action || row.action;
  const type = edit.type || row.type;

  // Two CSVs uploaded together: the opposite-sign row already sitting in the
  // combined preview (before anything is saved). Only show this while the
  // row is still actually being treated as a transfer — once refreshed/
  // unlinked, this row stopped claiming the match, so don't keep showing it.
  if (row.crossFileMatchId && type === "transfer") {
    const other = (analysis.rows || []).find(item => item.id === row.crossFileMatchId);
    if (other) {
      const accountName = accounts.find(account => account.id === other.sourceAccountId)?.name
        || other.sourceFileName
        || "Other account";
      return { date: other.date, description: other.description, signedAmount: other.signedAmount, accountName, originalType: null };
    }
  }

  // A transfer already saved in this account (e.g. from an earlier CSV import)
  // that this row is being linked to. If it was originally saved as a plain
  // income/expense (nobody realised it was actually a transfer until now),
  // surface that so it can be edited/kept as-is instead of silently merged.
  if ((action === "match_existing_transfer" || (row.action === "match_existing_transfer" && action === "new")) && row.matchTransactionId) {
    const existing = (appData.transactions || []).find(transaction => transaction.id === row.matchTransactionId);
    if (existing) {
      const linkedAccountId = edit.linkedAccountId || row.linkedAccountId;
      const accountName = accounts.find(account => account.id === linkedAccountId)?.name
        || accounts.find(account => account.id === existing.accountId)?.name
        || "Other account";
      const signedAmount = existing.type === "income" ? Number(existing.amount || 0) : -Number(existing.amount || 0);
      return { date: existing.date, description: existing.title || "Matched transaction", signedAmount, accountName, originalType: existing.type };
    }
  }

  return null;
}

// After an import actually lands, check the real math rather than trusting
// the preview: recompute each account's balance as of its last statement day
// and compare it to the bank's own balance for that day (the newest
// statement's, where several overlap). `adjustmentsByAccount` lists any
// "Trust the CSV" adjustments, so the result can say what was added.
function verifyImportBalances(finalData, accountTimelines, adjustmentsByAccount = {}) {
  return accountTimelines.map(({ accountId, timeline }) => {
    const lastDay = timeline.at(-1);
    const account = finalData.accounts.find(item => item.id === accountId);
    const calculatedBalance = calculateAccountBalanceAtDate(finalData, accountId, lastDay.date);
    const csvBalance = Number(lastDay.balance);
    const difference = roundMoney(calculatedBalance - csvBalance);
    return {
      accountId,
      accountName: account?.name || "Account",
      asOfDate: lastDay.date,
      csvFileName: lastDay.fileName,
      calculatedBalance,
      csvBalance,
      difference,
      matches: Math.abs(difference) < 0.005,
      trustAdjustments: adjustmentsByAccount[accountId] || []
    };
  });
}

// Preview check: the projected (untrusted) balances, plus — for each
// account whose CSV is trusted — the adjustments the import would add.
function buildPreviewVerification(projectedData, analysis, isTrusted) {
  const timelines = getAccountTimelines(analysis);
  const adjustmentsByAccount = {};
  timelines.forEach(({ accountId, timeline }) => {
    if (!isTrusted(accountId)) return;
    adjustmentsByAccount[accountId] = alignAccountToCsvTimeline(projectedData, accountId, timeline).adjustments;
  });
  return verifyImportBalances(projectedData, timelines, adjustmentsByAccount);
}

function groupAdjustmentsByAccount(adjustments) {
  return (adjustments || []).reduce((groups, adjustment) => {
    (groups[adjustment.accountId] ||= []).push(adjustment);
    return groups;
  }, {});
}

// Green/amber/red mirror csvImportService's three confidence tiers so the
// color always means the same thing: green is the highest confirmation
// (exact wording or corroborated timestamps), amber matched on the same
// day, red matched only within the 2-day pairing window and most needs a
// second look before importing.
function getConfidenceColor(confidence) {
  if (confidence === "High") return "var(--green)";
  if (confidence === "Medium") return "var(--orange)";
  return "var(--red)";
}

function getTransferText(row, edit, selectedAccountId, accounts) {
  const linkedAccountId = edit.linkedAccountId || row.linkedAccountId;
  if (!linkedAccountId) return "Choose the other account or add a new one.";

  const uploadedAccountId = row.sourceAccountId || selectedAccountId;
  const uploadedAccount = accounts.find(account => account.id === uploadedAccountId)?.name || "Selected account";
  const linkedAccount = accounts.find(account => account.id === linkedAccountId)?.name || "Other account";
  return row.signedAmount > 0
    ? `${uploadedAccount} FROM ${linkedAccount}`
    : `${uploadedAccount} TO ${linkedAccount}`;
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


function summariseCombinedAnalyses(analyses, rows) {
  const base = {
    total: rows.length,
    newRows: 0,
    plannedMatches: 0,
    existingTransferMatches: 0,
    duplicates: 0,
    needsReview: 0,
    transfers: rows.filter(row => row.type === "transfer").length,
    largeExpenses: rows.filter(row => row.suggestedExcludeFromBudget).length
  };
  rows.forEach(row => {
    if (row.action === "duplicate") base.duplicates += 1;
    else if (row.action === "match_planned") base.plannedMatches += 1;
    else if (row.action === "match_existing_transfer") base.existingTransferMatches += 1;
    else base.newRows += 1;
    if (row.warning || row.confidence === "Needs review") base.needsReview += 1;
  });
  return base;
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
