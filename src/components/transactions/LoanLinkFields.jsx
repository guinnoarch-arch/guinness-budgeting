// Linking an expense to a loan, with the interest/principal split.
export function LoanLinkFields({ activeLoans, autoEstimateLoanSplit, form, loanName, selectedLoan, update }) {
  return (
    <div className="loan-link-box full-width">
      <div className="section-header compact-header">
        <div>
          <h4>Loan / mortgage link</h4>
        </div>
      </div>

      <label>
        Is this linked to a loan?
        <select value={form.linkedLoanId || ""} onChange={e => update("linkedLoanId", e.target.value)}>
          <option value="">No</option>
          {activeLoans.map(loan => (
            <option key={loan.id} value={loan.id}>{loanName(loan)}</option>
          ))}
        </select>
      </label>

      {selectedLoan && (
        <div className="loan-link-split-grid">
          <label>
            Interest part
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.loanInterestAmount}
              onChange={e => update("loanInterestAmount", e.target.value)}
              placeholder="Estimated or from statement"
            />
          </label>

          <label>
            Capital / principal paid off
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.loanPrincipalAmount}
              onChange={e => update("loanPrincipalAmount", e.target.value)}
              placeholder="Amount reducing the balance"
            />
          </label>

          <label className="checkbox-label full-width">
            <input
              type="checkbox"
              checked={form.isLoanOverpayment}
              onChange={e => update("isLoanOverpayment", e.target.checked)}
            />
            <span>This includes an overpayment</span>
          </label>

          {form.isLoanOverpayment && (
            <label>
              Overpayment amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.loanOverpaymentAmount}
                onChange={e => update("loanOverpaymentAmount", e.target.value)}
                placeholder="Extra amount above normal payment"
              />
            </label>
          )}

          <div className="loan-link-actions full-width">
            <button type="button" className="secondary-button small" onClick={autoEstimateLoanSplit}>Auto-estimate split</button>
          </div>
        </div>
      )}
    </div>
  );
}
