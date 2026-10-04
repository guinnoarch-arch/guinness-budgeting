import { calculateAccountBalance } from "../../utils/calculations.js";
import { formatMoney, roundMoney } from "../../utils/money.js";
import { FieldError, RequiredMark } from "../common/FormFeedback.jsx";

// Pop-up for matching an account's balance to the bank's figure.
export function ReconcileModal({ appData, closeReconcile, reconcileAmount, reconcileErrors, reconciling, saveReconcile, setReconcileAmount }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={e => { e.preventDefault(); saveReconcile(); }} noValidate>
        <div className="section-header">
          <h2>Reconcile {reconciling.name}</h2>
          <button type="button" className="icon-button" onClick={closeReconcile} aria-label="Close">×</button>
        </div>

        <div className="form-grid">
          <label>
            Current balance
            <input
              type="text"
              disabled
              value={formatMoney(calculateAccountBalance(appData, reconciling.id))}
            />
          </label>

          <label>
            <span>Actual balance<RequiredMark /></span>
            <input
              {...reconcileErrors.fieldProps("actualBalance")}
              aria-required="true"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={reconcileAmount}
              onChange={e => setReconcileAmount(e.target.value)}
              onBlur={() => reconcileErrors.validateFieldOnBlur("actualBalance", { actualBalance: reconcileAmount })}
            />
            <FieldError fieldId={reconcileErrors.getFieldId("actualBalance")} message={reconcileErrors.errors.actualBalance} />
          </label>
        </div>

        <p className="muted">
          {(() => {
            const entered = parseFloat(reconcileAmount);
            if (!Number.isFinite(entered)) return "Enter the balance shown by your bank.";
            const difference = roundMoney(entered - calculateAccountBalance(appData, reconciling.id));
            if (difference === 0) return "No adjustment needed — the balances already match.";
            return `This will add an adjustment of ${difference > 0 ? "+" : "−"}${formatMoney(Math.abs(difference))}.`;
          })()}
        </p>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={closeReconcile}>Cancel</button>
          <button className="primary-button">Reconcile</button>
        </div>
      </form>
    </div>
  );
}
