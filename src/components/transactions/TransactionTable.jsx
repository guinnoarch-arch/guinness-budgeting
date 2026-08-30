import { useEffect, useState } from "react";
import { deleteTransaction } from "../../services/transactionService.js";
import { deleteStoredReceipt, getStoredReceipt } from "../../services/receiptStorageService.js";
import { signedMoney } from "../../utils/money.js";
import { getLinkedLoanId, getLoanById, getTransactionLoanSplit } from "../../utils/loanLinking.js";

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
  if (value >= 1024) return `${Math.round((value / 1024) * 10) / 10} KB`;
  return `${value} B`;
}

export default function TransactionTable({ appData, actions, transactions }) {
  const [receiptViewer, setReceiptViewer] = useState(null);
  const [receiptError, setReceiptError] = useState("");

  useEffect(() => {
    return () => {
      if (receiptViewer?.url) URL.revokeObjectURL(receiptViewer.url);
    };
  }, [receiptViewer?.url]);

  async function handleDelete(txn) {
    if (!confirm("Delete this transaction?")) return;

    if (txn.receiptId) {
      try {
        await deleteStoredReceipt(txn.receiptId);
      } catch (error) {
        console.warn("Could not delete stored receipt:", error);
      }
    }

    actions.updateAppData(deleteTransaction(appData, txn.id), { reason: "Transaction deleted" });
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
      setReceiptViewer({
        transaction: txn,
        url,
        fileName: record.fileName || txn.receiptFileName || "receipt",
        mimeType: record.mimeType || txn.receiptMimeType,
        sizeBytes: record.sizeBytes || txn.receiptSizeBytes
      });
    } catch (error) {
      setReceiptError(error.message || "Could not open receipt.");
    }
  }

  function closeReceiptViewer() {
    if (receiptViewer?.url) URL.revokeObjectURL(receiptViewer.url);
    setReceiptViewer(null);
  }

  return (
    <>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Title</th>
              <th>Category</th>
              <th>Account</th>
              <th>Amount</th>
              <th>Recurring?</th>
              <th>Receipt</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(txn => {
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

              return (
                <tr key={txn.id}>
                  <td>{txn.date}</td>
                  <td><span className={`pill ${txn.type}`}>{txn.type}</span></td>
                  <td>
                    <strong>{txn.title}</strong>
                    {txn.note && <small>{txn.note}</small>}
                    {linkedLoan && (
                      <div className="transaction-loan-badges">
                        <span className="pill transfer">Loan: {linkedLoan.name}</span>
                        {txn.isLoanOverpayment && <span className="pill warning">Overpayment</span>}
                        {loanSplit && <small>Capital {signedMoney(loanSplit.principalAmount, "income")} · interest {signedMoney(loanSplit.interestAmount, "expense")}</small>}
                      </div>
                    )}
                  </td>
                  <td>{txn.type === "expense" && txn.excludeFromBudget ? <span className="pill excluded">Excluded</span> : category?.name || "-"}</td>
                  <td>
                    {account?.name}
                    {transferPartner && (
                      <div>
                        <small>{txn.type === "expense" ? "→" : "←"} transfer with {transferPartnerAccount?.name || "another account"}</small>
                      </div>
                    )}
                  </td>
                  <td className={`amount ${txn.type}`}>{signedMoney(txn.amount, txn.type)}</td>
                  <td>{txn.isRecurring ? "Yes" : "No"}</td>
                  <td>
                    {txn.receiptId ? (
                      <button className="text-button" onClick={() => openReceipt(txn)}>View receipt</button>
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="text-button" onClick={() => actions.openEditTransaction(txn)}>Edit</button>
                      <button className="text-button danger-text" onClick={() => handleDelete(txn)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {receiptError && (
        <div className="restore-error-box">
          <strong>Receipt could not be opened</strong>
          <span>{receiptError}</span>
        </div>
      )}

      {receiptViewer && (
        <div className="modal-backdrop">
          <div className="modal-card receipt-viewer-modal">
            <div className="section-header">
              <div>
                <h2>{receiptViewer.fileName}</h2>
                <p className="muted-text">{receiptViewer.transaction.title} · {formatFileSize(receiptViewer.sizeBytes)}</p>
              </div>
              <button type="button" className="icon-button" onClick={closeReceiptViewer}>×</button>
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
