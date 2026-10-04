import { calculateAccountBalanceAtDate } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";
import { formatDate } from "./importDisplay.js";
import { getProjectedBalanceAtDate } from "../../services/importReviewService.js";

export function ReconciliationPreview({ appData, analysis, rowEdits, trusted }) {
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
