import { useState } from "react";
import { diagnoseCsvBalanceGaps, compareCsvOverlapWithApp, getPriorImportCoverageForAccount } from "../../services/csvImportService.js";
import { formatMoney, formatSignedAmount } from "../../utils/money.js";
import { DiagnosisDetails } from "./DiagnosisDetails.jsx";
import { buildDiagnosisRows, getAccountTimelines } from "../../services/importReviewService.js";
import { AlertTriangle, ArrowLeftRight, Check } from "lucide-react";
import { formatDisplayDate } from "../../utils/dates.js";

// Shared by the pre-import "Preview projected balances" check (mode
// "preview", runs the import against a throwaway copy of the data — nothing
// is saved) and the post-import result (mode "result", what actually got
// saved). Same shape either way: verifyImportBalances() output. The preview
// also gets the projected data itself, which "Diagnose problem" walks day by
// day against the CSV's own balances, and the per-account "Trust the CSV"
// switch.
export function BalanceVerificationPanel({ verification, mode, analysis, rowEdits, appData, projectedData, isTrusted, onSetTrusted, onFixOpeningBalance }) {
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
            <span className="status-with-icon">
              {item.matches ? <Check size={14} aria-hidden="true" /> : trusted ? <ArrowLeftRight size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
              <span>{item.accountName} <span className="status-word">{item.matches ? "matches" : trusted ? "will be adjusted" : "doesn't match"}</span></span>
            </span>
            <span>
              {formatMoney(item.calculatedBalance)} {mode === "preview" ? "projected" : "calculated"}
              {item.matches ? "" : ` vs ${formatMoney(item.csvBalance)} on the CSV (as of ${formatDisplayDate(item.asOfDate)})`}
            </span>
            {mode === "result" && item.trustAdjustments?.length > 0 && (
              <small>
                CSV trusted: {item.trustAdjustments.length} adjustment{item.trustAdjustments.length === 1 ? "" : "s"} added ({item.trustAdjustments.map(adjustment => `${formatSignedAmount(adjustment.amount)} on ${formatDisplayDate(adjustment.date)}`).join(", ")}) so the account matches the bank.
              </small>
            )}
            {trusted && (
              <small>
                CSV trusted — on import {item.trustAdjustments.length} dated adjustment{item.trustAdjustments.length === 1 ? "" : "s"} ({formatSignedAmount(adjustmentTotal)} in total) will be added so it ends at {formatMoney(item.csvBalance)}.
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
