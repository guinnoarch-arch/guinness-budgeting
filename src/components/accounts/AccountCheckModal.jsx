import { useMemo, useState } from "react";
import { buildAccountCheck } from "../../services/accountCheckService.js";
import { deleteTransaction, linkTransferPair } from "../../services/transactionService.js";
import { addDaysToIsoDate, todayIsoDate } from "../../utils/dates.js";
import { formatMoney } from "../../utils/money.js";

const RANGE_PRESETS = [
  ["30", "30 days"],
  ["90", "90 days"],
  ["365", "1 year"],
  ["all", "All time"]
];

const VIEW_FILTERS = [
  ["all", "All days"],
  ["issues", "Anything to check"],
  ["duplicates", "Possible duplicates"],
  ["transfers", "Transfer gaps"],
  ["out", "Out vs bank"]
];

function signedMoney(value) {
  const amount = Number(value || 0);
  return `${amount >= 0 ? "+" : "-"}${formatMoney(Math.abs(amount))}`;
}

function getEarliestDate(appData, accountId) {
  const dates = (appData.transactions || [])
    .filter(transaction => transaction.accountId === accountId && transaction.date)
    .map(transaction => transaction.date)
    .sort();
  return dates[0] || todayIsoDate();
}

// Everything in one account, day by day, so duplicates and missing transfer
// legs can be spotted by eye — with the bank's own end-of-day balance (from
// past CSV imports) next to the app's wherever one is known.
export default function AccountCheckModal({ account, appData, actions, close }) {
  const today = todayIsoDate();
  const [preset, setPreset] = useState("90");
  const [fromDate, setFromDate] = useState(addDaysToIsoDate(today, -90));
  const [toDate, setToDate] = useState(today);
  const [view, setView] = useState("all");
  const [message, setMessage] = useState("");

  const check = useMemo(
    () => buildAccountCheck(appData, account.id, { fromDate, toDate }),
    [appData, account.id, fromDate, toDate]
  );

  function choosePreset(value) {
    setPreset(value);
    setToDate(today);
    setFromDate(value === "all" ? getEarliestDate(appData, account.id) : addDaysToIsoDate(today, -Number(value)));
  }

  function removeTransaction(item) {
    if (!window.confirm(`Delete "${item.title}" (${signedMoney(item.signedAmount)})? This can't be undone from here.`)) return;
    actions.updateAppData(deleteTransaction(appData, item.id), { reason: "Account check: removed a duplicate transaction" });
    setMessage(`Deleted "${item.title}".`);
  }

  function linkTransfer(item, candidate) {
    const linked = linkTransferPair(appData, item.id, candidate.id);
    // A leg that was waiting for its other side is complete once linked, so
    // a later import mustn't try to attach another row to it.
    const settled = {
      ...linked,
      transactions: linked.transactions.map(transaction => (
        (transaction.id === item.id || transaction.id === candidate.id) && transaction.status === "one_side_imported"
          ? { ...transaction, status: "matched" }
          : transaction
      ))
    };
    actions.updateAppData(settled, { reason: "Account check: linked the two sides of a transfer", rulesTrigger: "transfer" });
    setMessage(`Linked "${item.title}" with "${candidate.title}" in ${candidate.accountName}.`);
  }

  const days = [...check.days].reverse().filter(day => {
    if (view === "duplicates") return day.hasDuplicate;
    if (view === "transfers") return day.hasTransferGap;
    if (view === "out") return day.gapMoves;
    if (view === "issues") return day.hasDuplicate || day.hasTransferGap || day.gapMoves;
    return true;
  });
  const counts = {
    all: check.days.length,
    issues: check.days.filter(day => day.hasDuplicate || day.hasTransferGap || day.gapMoves).length,
    duplicates: check.days.filter(day => day.hasDuplicate).length,
    transfers: check.days.filter(day => day.hasTransferGap).length,
    out: check.days.filter(day => day.gapMoves).length
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card account-check-modal">
        <div className="section-header">
          <div>
            <h2>Check {account.name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={close}>×</button>
        </div>

        <div className="account-check-controls">
          <div className="import-filter-row">
            {RANGE_PRESETS.map(([value, label]) => (
              <button key={value} type="button" className={`filter-chip ${preset === value ? "active" : ""}`} onClick={() => choosePreset(value)}>{label}</button>
            ))}
          </div>
          <div className="form-grid account-check-dates">
            <label>
              From
              <input type="date" value={fromDate} max={toDate} onChange={event => { setPreset(""); setFromDate(event.target.value); }} />
            </label>
            <label>
              To
              <input type="date" value={toDate} min={fromDate} onChange={event => { setPreset(""); setToDate(event.target.value); }} />
            </label>
          </div>
          <div className="import-filter-row">
            {VIEW_FILTERS.map(([value, label]) => (
              <button key={value} type="button" className={`filter-chip ${view === value ? "active" : ""}`} onClick={() => setView(value)}>
                {label} <span>{counts[value]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="account-check-summary">
          <span>{check.summary.duplicates} possible duplicate pair{check.summary.duplicates === 1 ? "" : "s"}</span>
          <span>{check.summary.transferGaps} transfer gap{check.summary.transferGaps === 1 ? "" : "s"}</span>
          <span>
            {check.summary.daysWithBankBalance === 0
              ? "No bank balances in this range (import a CSV with a Balance column to compare)"
              : `${check.summary.daysOut} of ${check.summary.daysWithBankBalance} day(s) with a bank balance don't match`}
          </span>
        </div>
        {message && <div className="import-status-box">{message}</div>}

        <div className="account-check-days">
          {days.length === 0 && <p className="muted">{view === "all" ? "No transactions in this range." : "Nothing to check here for this range."}</p>}
          {days.map(day => (
            <div key={day.date} className={`import-overlap-day ${day.gapMoves || day.hasDuplicate || day.hasTransferGap ? "problem" : "ok"}`}>
              <div className="account-check-day-header">
                <strong>{day.date}</strong>
                <span>App end of day {formatMoney(day.appBalance)}</span>
                {day.bankBalance !== null ? (
                  <span className={day.isOut ? "account-check-out" : "account-check-in"} title={day.bankSource ? `Bank balance from "${day.bankSource}"` : undefined}>
                    Bank {formatMoney(day.bankBalance)}{" "}
                    {day.isOut
                      ? <span className="import-overlap-gap">({signedMoney(day.gap)}{day.gapMoves ? `, moved ${signedMoney(day.gapChange)} today` : ""})</span>
                      : "✓"}
                  </span>
                ) : (
                  <span className="muted">No bank balance</span>
                )}
              </div>
              {day.items.length === 0 && <span className="import-overlap-empty">No transactions in the app this day.</span>}
              {day.items.map(item => (
                <div key={item.id} className="account-check-item">
                  <div className="import-overlap-cell">
                    <span>{item.title}</span>
                    <strong className={item.signedAmount >= 0 ? "positive-text" : "negative-text"}>{signedMoney(item.signedAmount)}</strong>
                    <small className="muted">{item.source}</small>
                  </div>
                  {item.flags.map((flag, index) => (
                    <div key={index} className={`account-check-flag ${flag.level}`}>
                      <span>{flag.text}</span>
                      {flag.kind === "duplicate" && (
                        <button type="button" className="secondary-button small" onClick={() => removeTransaction(item)}>Delete this one</button>
                      )}
                      {flag.candidates?.map(candidate => (
                        <span key={candidate.id} className="account-check-candidate">
                          {candidate.date} · {candidate.title} · {candidate.accountName}
                          <button type="button" className="secondary-button small" onClick={() => linkTransfer(item, candidate)}>Link as transfer</button>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
