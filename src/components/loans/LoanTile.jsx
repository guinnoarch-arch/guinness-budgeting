import { formatMoney } from "../../utils/money.js";

export function LoanTile({ loan, index, selected, onSelect }) {
  const isMortgage = loan.type === "mortgage";
  const fallbackName = isMortgage ? `Mortgage ${index + 1}` : `Loan ${index + 1}`;

  return (
    <button
      type="button"
      className={`loan-summary-tile ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="loan-summary-type">{isMortgage ? "Mortgage" : "Student loan"}</span>
      <strong>{loan.name || fallbackName}</strong>
      <span className="loan-summary-amount">{formatMoney(loan.currentBalance, false)}</span>
      <small>{selected ? "Click to hide details" : "Click to view details"}</small>
    </button>
  );
}
