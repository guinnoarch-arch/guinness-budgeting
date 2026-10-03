import { useState } from "react";

export function DuplicateReviewModal({ row, existingTransaction, appData, close, updateRow, updateExistingDuplicate, keepExisting, onUseImported }) {
  const [imported, setImported] = useState(() => ({
    date: row?.date || "",
    description: row?.description || "",
    amount: row?.amount ?? "",
    type: row?.baseType || row?.type || "expense",
    categoryId: row?.categoryId || ""
  }));
  const [existing, setExisting] = useState(() => ({
    date: existingTransaction?.date || "",
    title: existingTransaction?.title || "",
    amount: existingTransaction?.amount ?? "",
    type: existingTransaction?.type || "expense",
    categoryId: existingTransaction?.categoryId || ""
  }));

  if (!row || !existingTransaction) return null;

  const categories = (appData.categories || []).filter(category => category.isActive !== false && category.type === imported.type);
  const existingCategories = (appData.categories || []).filter(category => category.isActive !== false && category.type === existing.type);

  function saveExisting() {
    updateExistingDuplicate(existingTransaction.id, {
      date: existing.date,
      title: existing.title,
      amount: Number(existing.amount),
      type: existing.type,
      categoryId: existing.categoryId
    });
  }

  function chooseImported() {
    if (!imported.date || !imported.description || !Number(imported.amount)) return;
    updateRow(row.id, "date", imported.date);
    updateRow(row.id, "description", imported.description);
    updateRow(row.id, "amount", Number(imported.amount));
    updateRow(row.id, "type", imported.type);
    updateRow(row.id, "categoryId", imported.categoryId || "");
    onUseImported(row, imported);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card import-duplicate-review-modal">
        <div className="section-header">
          <div>
            <h2>Compare possible duplicate</h2>
            <p className="muted-text">The import found an existing transaction with the same account, date, amount and similar description. Nothing is deleted automatically.</p>
          </div>
          <button type="button" className="icon-button" onClick={close}>×</button>
        </div>

        <div className="two-column">
          <section className="card">
            <h3>Imported statement row</h3>
            <div className="form-grid">
              <label>Date<input type="date" value={imported.date} onChange={event => setImported(prev => ({ ...prev, date: event.target.value }))} /></label>
              <label>Description<input value={imported.description} onChange={event => setImported(prev => ({ ...prev, description: event.target.value }))} /></label>
              <label>Amount<input type="number" step="0.01" value={imported.amount} onChange={event => setImported(prev => ({ ...prev, amount: event.target.value }))} /></label>
              <label>Type<select value={imported.type} onChange={event => setImported(prev => ({ ...prev, type: event.target.value, categoryId: "" }))}>
                <option value="expense">Expense</option><option value="income">Income</option>
              </select></label>
              <label>Category<select value={imported.categoryId} onChange={event => setImported(prev => ({ ...prev, categoryId: event.target.value }))}>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select></label>
            </div>
          </section>

          <section className="card">
            <h3>Existing transaction</h3>
            <div className="form-grid">
              <label>Date<input type="date" value={existing.date} onChange={event => setExisting(prev => ({ ...prev, date: event.target.value }))} /></label>
              <label>Description<input value={existing.title} onChange={event => setExisting(prev => ({ ...prev, title: event.target.value }))} /></label>
              <label>Amount<input type="number" step="0.01" value={existing.amount} onChange={event => setExisting(prev => ({ ...prev, amount: event.target.value }))} /></label>
              <label>Type<select value={existing.type} onChange={event => setExisting(prev => ({ ...prev, type: event.target.value, categoryId: "" }))}>
                <option value="expense">Expense</option><option value="income">Income</option>
              </select></label>
              <label>Category<select value={existing.categoryId} onChange={event => setExisting(prev => ({ ...prev, categoryId: event.target.value }))}>
                {existingCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select></label>
            </div>
            <button type="button" className="secondary-button small" onClick={saveExisting}>Save existing edits</button>
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => keepExisting(row.id)}>Keep existing</button>
          <button type="button" className="primary-button" onClick={chooseImported}>Use imported details</button>
        </div>
        <p className="muted-text">“Use imported details” keeps one transaction record, replaces its editable details with the statement row, and then links the imported bank row to it. It does not create a second transaction.</p>
      </div>
    </div>
  );
}
