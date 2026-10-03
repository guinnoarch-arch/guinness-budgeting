import { formatMoney } from "../../utils/money.js";
import { X } from "lucide-react";
import { formatDisplayDate } from "../../utils/dates.js";

export function ImportBatchDetailModal({ batch, appData, close, undoImport }) {
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
          <button type="button" className="icon-button" onClick={close} aria-label="Close"><X size={18} aria-hidden="true" /></button>
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
                <span>{formatDisplayDate(transaction.date)} · {transaction.title}</span>
                <strong>{formatMoney(transaction.amount)}</strong>
              </div>
            ))}
          </div>
          <div>
            <h4>Linked transactions</h4>
            {linkedTransactions.length === 0 ? <p className="muted">None.</p> : linkedTransactions.slice(0, 8).map(transaction => (
              <div key={transaction.id} className="simple-row">
                <span>{formatDisplayDate(transaction.date)} · {transaction.title}</span>
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
