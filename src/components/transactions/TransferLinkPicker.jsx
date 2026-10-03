import { signedMoney } from "../../utils/money.js";

// Turning an existing income or expense into one side of a transfer.
export function TransferLinkPicker({ appData, editingTransaction, form, linkCandidates, linkSearch, linkToExistingTransaction, setLinkSearch, setShowLinkPicker, showLinkPicker }) {
  return (
    <div className="full-width receipt-warning-box link-transfer-box">
      <div className="section-header compact-header">
        <div>
          <strong>Is this actually one half of a transfer?</strong>
          <p className="muted-text">If the other side is already recorded as its own transaction (e.g. imported separately), link them instead of creating a new one.</p>
        </div>
        <button type="button" className="secondary-button small" onClick={() => setShowLinkPicker(v => !v)}>
          {showLinkPicker ? "Cancel linking" : "Link to an existing transaction"}
        </button>
      </div>

      {showLinkPicker && (
        <div className="link-transfer-picker">
          <p className="muted-text">Only showing unlinked {editingTransaction.type === "expense" ? "income" : "expense"} transactions for the exact same amount ({signedMoney(form.amount || editingTransaction.amount, editingTransaction.type === "expense" ? "income" : "expense")}) — a transfer moves the same amount out one side and into the other.</p>
          <label>
            Narrow down by title or account
            <input value={linkSearch} onChange={e => setLinkSearch(e.target.value)} placeholder="e.g. ISA, Chase" />
          </label>
          <div className="rule-list-stack">
            {linkCandidates.length === 0 && <p className="muted">No unlinked {editingTransaction.type === "expense" ? "income" : "expense"} transactions for that exact amount.</p>}
            {linkCandidates.map(candidate => {
              const candidateAccount = (appData.accounts || []).find(acc => acc.id === candidate.accountId);
              return (
                <div key={candidate.id} className="rule-edit-row link-candidate-row">
                  <div className="rule-readable-summary">
                    <strong>{candidate.title}</strong>
                    <span>{candidate.date} · {signedMoney(candidate.amount, candidate.type)} · {candidateAccount?.name || "Unknown account"}</span>
                  </div>
                  <button type="button" className="primary-button small" onClick={() => linkToExistingTransaction(candidate.id)}>Link this pair</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
