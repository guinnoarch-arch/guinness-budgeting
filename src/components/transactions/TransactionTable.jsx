import { useEffect, useState } from "react";
import { getErrorMessage } from "../../utils/errors.js";
import { deleteTransaction, getMatchingExclusionRules } from "../../services/transactionService.js";
import { deleteStoredReceipt, getStoredReceipt } from "../../services/receiptStorageService.js";
import { signedMoney } from "../../utils/money.js";
import { getLinkedLoanId, getLoanById, getTransactionLoanSplit } from "../../utils/loanLinking.js";
import { formatFileSize } from "../../utils/files.js";
import { X } from "lucide-react";
import { formatDisplayDate } from "../../utils/dates.js";

// The list shows one line per transaction (name, date, amount). Everything
// else, and Edit/Delete, is in the details pop-up that opens on click.
export default function TransactionTable({ appData, actions, transactions }) {
  const [detailsId, setDetailsId] = useState(null);
  const [receiptViewer, setReceiptViewer] = useState(null);
  const [receiptError, setReceiptError] = useState("");

  // Looked up fresh each render so the pop-up shows saved edits, and closes
  // itself if the transaction is deleted.
  const detailsTxn = detailsId ? appData.transactions.find(txn => txn.id === detailsId) : null;

  useEffect(() => {
    return () => {
      if (receiptViewer?.url) URL.revokeObjectURL(receiptViewer.url);
    };
  }, [receiptViewer?.url]);

  function handleDelete(txn) {
    const partnerNote = txn.transferLinkId ? " The other side of the transfer was kept but is no longer linked." : "";
    setDetailsId(null);
    actions.updateAppDataWithUndo(deleteTransaction(appData, txn.id), {
      reason: "Transaction deleted",
      message: `Deleted "${txn.title}".${partnerNote}`,
      // The receipt file is only removed once Undo is no longer possible.
      onExpire: txn.receiptId
        ? () => deleteStoredReceipt(txn.receiptId).catch(() => {})
        : null
    });
  }

  function handleEdit(txn) {
    setDetailsId(null);
    actions.openEditTransaction(txn);
  }

  async function openReceipt(txn) {
    setReceiptError("");

    if (receiptViewer?.url) URL.revokeObjectURL(receiptViewer.url);

    try {
      const record = await getStoredReceipt(txn.receiptId);
      if (!record) {
        setReceiptError("Receipt metadata exists, but the stored file was not found on this device.");
        return;
      }

      const url = URL.createObjectURL(record.blob);
      setDetailsId(null);
      setReceiptViewer({
        transaction: txn,
        url,
        fileName: record.fileName || txn.receiptFileName || "receipt",
        mimeType: record.mimeType || txn.receiptMimeType,
        sizeBytes: record.sizeBytes || txn.receiptSizeBytes
      });
    } catch (error) {
      setReceiptError(getErrorMessage(error, "Couldn't open receipt. Try again in a moment."));
    }
  }

  function closeReceiptViewer() {
    if (receiptViewer?.url) URL.revokeObjectURL(receiptViewer.url);
    setReceiptViewer(null);
  }

  return (
    <>
      <div className="table-card">
        <ul className="transaction-list" aria-label="Transactions">
          {transactions.map(txn => (
            <li key={txn.id}>
              <button
                type="button"
                className="transaction-row"
                aria-haspopup="dialog"
                onClick={() => {
                  setReceiptError("");
                  setDetailsId(txn.id);
                }}
              >
                <span className="transaction-row-title">{txn.title}</span>
                <span className="transaction-row-date">{formatDisplayDate(txn.date)}</span>
                <span className={`transaction-row-amount amount ${txn.type}`}>{signedMoney(txn.amount, txn.type)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {receiptError && (
        <div className="restore-error-box">
          <strong>Receipt could not be opened</strong>
          <span>{receiptError}</span>
        </div>
      )}

      {detailsTxn && (
        <TransactionDetails
          appData={appData}
          txn={detailsTxn}
          onClose={() => setDetailsId(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onViewReceipt={openReceipt}
        />
      )}

      {receiptViewer && (
        <div className="modal-backdrop">
          <div className="modal-card receipt-viewer-modal">
            <div className="section-header">
              <div>
                <h2>{receiptViewer.fileName}</h2>
                <p className="muted-text">{receiptViewer.transaction.title} · {formatFileSize(receiptViewer.sizeBytes)}</p>
              </div>
              <button type="button" className="icon-button" onClick={closeReceiptViewer} aria-label="Close"><X size={18} aria-hidden="true" /></button>
            </div>

            {receiptViewer.mimeType?.startsWith("image/") ? (
              <img src={receiptViewer.url} alt="Receipt" className="receipt-large-preview" />
            ) : receiptViewer.mimeType === "application/pdf" ? (
              <iframe src={receiptViewer.url} title="Receipt PDF" className="receipt-pdf-preview" />
            ) : (
              <p className="muted">This receipt type cannot be previewed directly.</p>
            )}

            <div className="modal-actions">
              <a className="secondary-button" href={receiptViewer.url} download={receiptViewer.fileName}>Download receipt</a>
              <button className="primary-button" onClick={closeReceiptViewer}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TransactionDetails({ appData, txn, onClose, onEdit, onDelete, onViewReceipt }) {
  const category = appData.categories.find(cat => cat.id === txn.categoryId);
  const account = appData.accounts.find(acc => acc.id === txn.accountId);
  const transferPartner = txn.transferLinkId
    ? appData.transactions.find(item => item.id === txn.transferLinkId)
    : null;
  const transferPartnerAccount = transferPartner
    ? appData.accounts.find(acc => acc.id === transferPartner.accountId)
    : null;
  const linkedLoan = getLoanById(appData, getLinkedLoanId(txn));
  const loanSplit = linkedLoan ? getTransactionLoanSplit(txn, linkedLoan) : null;
  const matchingRules = getMatchingExclusionRules(txn, appData.exclusionRules);
  const typeLabel = txn.transferLinkId ? "transfer" : txn.type;

  return (
    <div className="modal-backdrop">
      <div className="modal-card transaction-details-modal">
        <div className="section-header">
          <h2>{txn.title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>

        <dl className="transaction-details">
          <div>
            <dt>Amount</dt>
            <dd className={`amount ${txn.type}`}>{signedMoney(txn.amount, txn.type)}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDisplayDate(txn.date)}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd><span className={`pill ${typeLabel}`}>{typeLabel}</span></dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{txn.type === "expense" && txn.excludeFromBudget ? <span className="pill excluded">Excluded</span> : category?.name || "-"}</dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>
              {account?.name || "-"}
              {transferPartner && (
                <small>{txn.type === "expense" ? "→" : "←"} transfer with {transferPartnerAccount?.name || "another account"}</small>
              )}
            </dd>
          </div>
          {txn.note && (
            <div>
              <dt>Note</dt>
              <dd>{txn.note}</dd>
            </div>
          )}
          {matchingRules.length > 0 && (
            <div>
              <dt>Payment rule</dt>
              <dd>
                <span className={`pill rule-match-pill ${txn.ruleExempt ? "exempt" : ""}`}>
                  {txn.ruleExempt ? "Rule exempt" : "Rule matched"}
                </span>
                <small>
                  Matches {matchingRules.map(rule => rule.matchText).join(", ")}
                  {txn.ruleExempt ? " (exempted on this transaction)" : ""}
                </small>
              </dd>
            </div>
          )}
          {linkedLoan && (
            <div>
              <dt>Loan</dt>
              <dd>
                <div className="transaction-loan-badges">
                  <span className="pill transfer">Loan: {linkedLoan.name}</span>
                  {txn.isLoanOverpayment && <span className="pill warning">Overpayment</span>}
                </div>
                {loanSplit && <small>Capital {signedMoney(loanSplit.principalAmount, "income")} · interest {signedMoney(loanSplit.interestAmount, "expense")}</small>}
              </dd>
            </div>
          )}
          <div>
            <dt>Recurring?</dt>
            <dd>{txn.isRecurring ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Receipt</dt>
            <dd>
              {txn.receiptId ? (
                <button type="button" className="text-button" onClick={() => onViewReceipt(txn)}>View receipt</button>
              ) : (
                <span className="muted">None</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="modal-actions">
          <button type="button" className="danger-button" onClick={() => onDelete(txn)}>Delete</button>
          <button type="button" className="primary-button" onClick={() => onEdit(txn)}>Edit</button>
        </div>
      </div>
    </div>
  );
}
