import { useState } from "react";
import { formatMoney, formatSignedAmount } from "../../utils/money.js";
import { describeRowStatus } from "./importDisplay.js";
import { formatDisplayDate } from "../../utils/dates.js";

export function DiagnosisDetails({ diagnosis, overlap, accountId, onFixOpeningBalance }) {
  const startIsOut = Math.abs(diagnosis.startGap) >= 0.005;
  const nothingChanges = diagnosis.changedDays.length === 0;
  // Opened straight away when the statement is already out on its first
  // day — that's exactly when seeing the shared days side by side helps.
  const [showOverlap, setShowOverlap] = useState(startIsOut);

  return (
    <div className="import-diagnosis-box">
      <span>
        Out on <strong>{diagnosis.daysOut}</strong> of {diagnosis.totalDays} statement day{diagnosis.totalDays === 1 ? "" : "s"} ({formatDisplayDate(diagnosis.firstDate)} to {formatDisplayDate(diagnosis.lastDate)}), compared end of day against the bank's own balance.
      </span>

      {startIsOut && (
        <div className="import-diagnosis-section">
          <strong>Already out before the statement starts</strong>
          <span>
            Just before {formatDisplayDate(diagnosis.firstDate)} the app has {formatMoney(diagnosis.ghBefore)}, but the bank's balance implies {formatMoney(diagnosis.csvBefore)} (the app is {formatMoney(Math.abs(diagnosis.ghBefore - diagnosis.csvBefore))} {diagnosis.ghBefore > diagnosis.csvBefore ? "higher" : "lower"}). That comes from the account's opening balance or something dated before this statement, not from these rows.
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
          <strong>{formatDisplayDate(day.date)}: gap moves by {formatSignedAmount(day.change)}</strong>
          <span>End of day the app has {formatMoney(day.ghBalance)}, the bank ({day.fileName}) has {formatMoney(day.csvBalance)}.</span>
          {day.missingFromApp.length > 0 && (
            <>
              <span className="import-diagnosis-label">On the CSV but not in the app:</span>
              <ul>
                {day.missingFromApp.map(row => (
                  <li key={row.id}>{row.description} · {formatSignedAmount(row.signedAmount)} — {describeRowStatus(row.status)}</li>
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
                    {item.kind === "adjustment" ? "Balance adjustment" : item.title} · {formatSignedAmount(item.signedAmount)}
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
            The app is up to date to <strong>{formatDisplayDate(overlap.appLatestDate)}</strong> and this CSV starts on <strong>{formatDisplayDate(overlap.startDate)}</strong>, so {formatDisplayDate(overlap.startDate)} to {formatDisplayDate(overlap.endDate)} is in both.
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
                {formatDisplayDate(item.date)}: {item.fileName} says {formatMoney(item.balance)}, {item.earlierImport ? `your earlier import "${item.otherFileName}"` : item.otherFileName} said {formatMoney(item.otherBalance)} ({formatSignedAmount(item.difference)}).
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
              <li key={row.id}>{formatDisplayDate(row.date)} · {row.description} · {formatSignedAmount(row.signedAmount)}</li>
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
              <span><strong>{formatDisplayDate(day.date)}</strong> · end of day {formatMoney(day.csvBalance)}</span>
              <span>
                end of day {formatMoney(day.appBalance)}
                {dayOk ? " · matches" : Math.abs(day.gap) >= 0.005 ? <span className="import-overlap-gap"> ({formatSignedAmount(day.gap)})</span> : ""}
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
      <strong className={amount >= 0 ? "positive-text" : "negative-text"}>{formatSignedAmount(amount)}</strong>
      {note && <small>{note}</small>}
    </span>
  );
}
