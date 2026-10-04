import { formatFileSize } from "../../utils/files.js";

// Attaching, previewing and removing a receipt image or PDF.
export function ReceiptField({ form, handleReceiptFile, hasExistingReceipt, receiptError, receiptFile, receiptPreview, removeExistingReceipt, setReceiptFile, setRemoveExistingReceipt }) {
  return (
    <div className="receipt-field full-width">
      <div className="section-header compact-header">
        <div>
          <h4>Receipt attachment</h4>
          <p className="muted-text">Saved on this device. Images or PDFs up to 10 MB.</p>
        </div>
      </div>

      {hasExistingReceipt && (
        <div className="receipt-current-card">
          <div>
            <strong>{form.receiptFileName || "Stored receipt"}</strong>
            <small>{formatFileSize(form.receiptSizeBytes)} · {form.receiptUploadedAt ? new Date(form.receiptUploadedAt).toLocaleString("en-GB") : "Stored locally"}</small>
          </div>
          {receiptPreview?.url && receiptPreview.mimeType?.startsWith("image/") && (
            <img src={receiptPreview.url} alt="Receipt preview" className="receipt-thumb" />
          )}
          {receiptPreview?.missing && <small className="danger-text">Receipt link exists, but the stored file was not found on this device.</small>}
          {receiptPreview?.error && <small className="danger-text">{receiptPreview.error}</small>}
          <button type="button" className="secondary-button small" onClick={() => { setRemoveExistingReceipt(true); setReceiptFile(null); }}>
            Remove receipt
          </button>
        </div>
      )}

      {removeExistingReceipt && !receiptFile && (
        <div className="receipt-warning-box">Receipt will be removed when you save this transaction.</div>
      )}

      {receiptFile && (
        <div className="receipt-current-card selected-receipt-card">
          <div>
            <strong>Selected: {receiptFile.name}</strong>
            <small>{formatFileSize(receiptFile.size)} · will be attached when saved</small>
          </div>
          <button type="button" className="secondary-button small" onClick={() => setReceiptFile(null)}>Clear selected file</button>
        </div>
      )}

      <label>
        {hasExistingReceipt ? "Replace receipt" : "Attach receipt"}
        <input type="file" accept="image/*,.pdf,application/pdf" onChange={handleReceiptFile} />
      </label>
      {receiptError && <small className="danger-text">{receiptError}</small>}
    </div>
  );
}
