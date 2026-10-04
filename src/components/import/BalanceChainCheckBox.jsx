import { formatMoney } from "../../utils/money.js";
import { formatDisplayDate } from "../../utils/dates.js";

export function BalanceChainCheckBox({ check, label }) {
  if (!check?.checked) {
    return (
      <div className="import-reconciliation-box muted-box">
        <strong>{label ? `${label}: running balance not checked` : "Running balance not checked"}</strong>
        <span>{check?.message || "Map a balance column to have the app verify its own maths against the bank's running balance."}</span>
      </div>
    );
  }

  return (
    <div className={`import-reconciliation-box ${check.reconciled ? "ok" : "warning"}`}>
      <div>
        <strong>{label ? `${label}: ` : ""}{check.reconciled ? "Running balance reconciles" : "Running balance doesn't add up"}</strong>
        <span>{check.message}</span>
      </div>
      {!check.reconciled && check.mismatches?.length > 0 && (
        <ul className="import-balance-chain-mismatches">
          {check.mismatches.map(mismatch => (
            <li key={`${mismatch.rowIndex}_${mismatch.date}`}>
              {formatDisplayDate(mismatch.date)} · {mismatch.description} — expected {formatMoney(mismatch.expectedBalance)}, CSV shows {formatMoney(mismatch.actualBalance)} ({mismatch.difference >= 0 ? "+" : ""}{formatMoney(mismatch.difference)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
