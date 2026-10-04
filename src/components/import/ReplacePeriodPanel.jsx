import { useMemo } from "react";
import { planReplacePeriod } from "../../services/csvImportService.js";
import { formatSignedAmount } from "../../utils/money.js";
import { formatDisplayDate } from "../../utils/dates.js";

export function ReplacePeriodPanel({ range, accountName, appData, activePlan, editor, openEditor, updateEditor, applyEditor, stopReplacing }) {
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
        <strong>{accountName}: {formatDisplayDate(range.fromDate)} to {formatDisplayDate(range.toDate)}</strong>
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
                  {formatDisplayDate(item.date)} · {item.title} · <strong className={item.signedAmount >= 0 ? "positive-text" : "negative-text"}>{formatSignedAmount(item.signedAmount)}</strong>
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
                    Also remove its other side in <strong>{item.partner.accountName}</strong>: {formatDisplayDate(item.partner.date)} · {item.partner.title} · {formatSignedAmount(item.partner.signedAmount)}
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
