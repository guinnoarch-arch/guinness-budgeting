import { formatMoney } from "../../utils/money.js";
import { formatDisplayDate } from "../../utils/dates.js";

export function ImportAnalysisSummary({ analysis }) {
  const totals = analysis.totals;
  const balanceText = analysis.reconciliation?.available
    ? `${formatMoney(analysis.reconciliation.csvClosingBalance)} on ${formatDisplayDate(analysis.reconciliation.latestCsvDate)}`
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

      <UnreadableRowsNotice files={analysis.files || []} />
    </section>
  );
}

// Rows the parser couldn't turn into a transaction, so they're visible
// before confirming rather than silently missing from the preview.
function UnreadableRowsNotice({ files }) {
  const showFileName = files.length > 1;
  const withFile = files.flatMap(file => (file.unreadableRows || []).map(row => ({
    ...row,
    label: showFileName ? `${file.fileName} — ${row.message}` : row.message
  })));
  const errors = withFile.filter(row => row.kind === "error");
  const zeroRows = withFile.filter(row => row.kind === "info");
  if (!errors.length && !zeroRows.length) return null;

  return (
    <div className="import-unreadable-rows">
      {errors.length > 0 && (
        <div className="restore-error-box" role="alert">
          <strong>
            {errors.length} row{errors.length === 1 ? "" : "s"} couldn't be read and won't be imported
          </strong>
          <span>Check these rows in your bank's CSV, or check the Date and Amount columns are mapped correctly above.</span>
          <ul>
            {errors.map(row => <li key={row.label}>{row.label}</li>)}
          </ul>
        </div>
      )}
      {zeroRows.length > 0 && (
        <p className="muted-text">
          {zeroRows.length} row{zeroRows.length === 1 ? " has" : "s have"} an amount of £0.00 and {zeroRows.length === 1 ? "was" : "were"} left out
          ({zeroRows.map(row => `row ${row.rowNumber}`).join(", ")}).
        </p>
      )}
    </div>
  );
}

export function SummaryItem({ label, value }) {
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
