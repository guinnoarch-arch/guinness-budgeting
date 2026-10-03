import { formatMoney } from "../../utils/money.js";
import { getMatchedTransactionInfo, getRowEdit } from "../../services/importReviewService.js";
import { getActionOptions, getConfidenceColor, getTransferText } from "./importDisplay.js";
import { ADD_ACCOUNT_VALUE } from "./importSettings.js";
import { ArrowUpDown, RotateCcw } from "lucide-react";
import { formatDisplayDate } from "../../utils/dates.js";

// One row of the "Review rows before importing" table, plus the connector
// row drawn under the first half of a matched transfer pair.
export function ImportPreviewRow({
  row,
  nextVisibleRowId,
  analysis,
  rowEdits: effectiveRowEdits,
  appData,
  baseData,
  activeAccounts,
  selectedAccountId,
  incomeCategories,
  expenseCategories,
  updateRow,
  handleTransferAccountChange,
  markRowNotATransfer,
  rejectCrossFileMatch,
  openDuplicateReview
}) {
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
  const isFirstOfVisiblePair = Boolean(pairColor) && nextVisibleRowId === row.crossFileMatchId;
  const mergeSelected = action === "match_existing_transfer";

  return (
    <>
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
      <td>{formatDisplayDate(displayDate)}{row.time && <small>{row.time}</small>}</td>
      {analysis.isMulti && <td><small>{row.sourceFileName}</small><small>{appData.accounts.find(account => account.id === row.sourceAccountId)?.name || "Unknown account"}</small></td>}
      <td>
        <strong>{displayDescription}</strong>
        <small style={{ color: getConfidenceColor(row.confidence), fontWeight: 600 }}>{row.confidence} confidence</small>
      </td>
      <td className={`numeric ${displaySignedAmount >= 0 ? "positive-text" : "negative-text"}`}>{displaySignedAmount >= 0 ? `+${formatMoney(displayAmount)}` : `-${formatMoney(displayAmount)}`}</td>
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
                <RotateCcw size={14} aria-hidden="true" /> Not this match
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
              <ArrowUpDown size={14} aria-hidden="true" /> Linked transfer — matched with the row below
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
