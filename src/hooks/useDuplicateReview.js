import { useState } from "react";

// Comparing a CSV row with the saved transaction it looks like a duplicate of,
// and choosing which details to keep.
export default function useDuplicateReview({ actions, appData, setStatus, updateRow }) {
  const [duplicateReviewRowId, setDuplicateReviewRowId] = useState(null);

  function openDuplicateReview(row) {
    setDuplicateReviewRowId(row.id);
  }

  function closeDuplicateReview() {
    setDuplicateReviewRowId(null);
  }

  function updateExistingDuplicate(transactionId, changes) {
    const nextTransactions = (appData.transactions || []).map(transaction => (
      transaction.id === transactionId
        ? { ...transaction, ...changes, updatedAt: new Date().toISOString() }
        : transaction
    ));
    actions.updateAppData({ ...appData, transactions: nextTransactions }, { reason: "Duplicate review: existing transaction edited" });
  }

  function keepExistingDuplicate(rowId) {
    updateRow(rowId, "include", false);
    updateRow(rowId, "action", "duplicate");
    setStatus("Kept the existing transaction. The imported row will be skipped.");
    closeDuplicateReview();
  }

  function applyImportedDuplicate(row, importedValues) {
    if (!row.duplicateTransactionId) return;

    const now = new Date().toISOString();
    const existing = appData.transactions.find(transaction => transaction.id === row.duplicateTransactionId);
    if (!existing) return;

    const updatedExisting = {
      ...existing,
      date: importedValues.date,
      amount: Number(importedValues.amount),
      title: importedValues.description || existing.title,
      type: importedValues.type,
      categoryId: importedValues.type === "expense" || importedValues.type === "income" ? importedValues.categoryId || existing.categoryId : null,
      accountId: existing.accountId,
      updatedAt: now
    };

    actions.updateAppData({
      ...appData,
      transactions: (appData.transactions || []).map(transaction => transaction.id === existing.id ? updatedExisting : transaction)
    }, { reason: "Duplicate review: imported details selected" });

    updateRow(row.id, "include", true);
    updateRow(row.id, "action", "match_planned");
    updateRow(row.id, "matchTransactionId", existing.id);
    updateRow(row.id, "type", importedValues.type);
    updateRow(row.id, "categoryId", importedValues.categoryId || "");
    updateRow(row.id, "date", importedValues.date);
    updateRow(row.id, "description", importedValues.description);
    updateRow(row.id, "amount", Number(importedValues.amount));
    setStatus("Imported details selected. The duplicate will be linked to the existing transaction when you confirm the import.");
    closeDuplicateReview();
  }

  return {
    applyImportedDuplicate,
    closeDuplicateReview,
    duplicateReviewRowId,
    keepExistingDuplicate,
    openDuplicateReview,
    updateExistingDuplicate
  };
}
