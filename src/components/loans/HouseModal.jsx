import { FieldError, RequiredMark } from "../common/FormFeedback.jsx";
import { HOUSE_OWNERSHIP_MODES } from "../../utils/houseTracking.js";
import { X } from "lucide-react";

export function HouseModal({ houseForm, editingHouse, accounts, updateHouseForm, closeHouseModal, submitHouse, validation }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submitHouse} noValidate>
        <div className="section-header">
          <h2>{editingHouse ? "Edit house" : "Add house"}</h2>
          <button type="button" className="icon-button" onClick={closeHouseModal} aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="form-section-card">
          <h3>House details</h3>
          <div className="form-grid">
            <label>
              <span>House name<RequiredMark /></span>
              <input {...validation.fieldProps("name")} aria-required="true" value={houseForm.name} onChange={event => updateHouseForm("name", event.target.value)} />
              <FieldError fieldId={validation.getFieldId("name")} message={validation.errors.name} />
            </label>
            <label>Address/name label<input value={houseForm.addressLabel} onChange={event => updateHouseForm("addressLabel", event.target.value)} /></label>
            <label>Purchase price<input type="number" min="0" step="0.01" value={houseForm.purchasePrice} onChange={event => updateHouseForm("purchasePrice", event.target.value)} /></label>
            <label>Purchase date<input type="date" value={houseForm.purchaseDate} onChange={event => updateHouseForm("purchaseDate", event.target.value)} /></label>
            <label>Current estimated value<input type="number" min="0" step="0.01" value={houseForm.propertyValue} onChange={event => updateHouseForm("propertyValue", event.target.value)} /></label>
            <label>Ownership/contribution mode<select value={houseForm.ownershipMode} onChange={event => updateHouseForm("ownershipMode", event.target.value)}>
              {HOUSE_OWNERSHIP_MODES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label className="full-width">Agreement notes / personal tracking note<textarea value={houseForm.agreementNotes} onChange={event => updateHouseForm("agreementNotes", event.target.value)} placeholder="Mortgage split, deposit tracking, renovation rules..." /></label>
            <label className="full-width">Notes<textarea value={houseForm.notes} onChange={event => updateHouseForm("notes", event.target.value)} /></label>
          </div>
        </div>
        <div className="form-section-card">
          <h3>Mortgage details</h3>
          <div className="form-grid">
            <label>Original mortgage amount<input type="number" min="0" step="0.01" value={houseForm.mortgageOriginalAmount} onChange={event => updateHouseForm("mortgageOriginalAmount", event.target.value)} /></label>
            <label>Current mortgage balance<input type="number" min="0" step="0.01" value={houseForm.mortgageCurrentBalance} onChange={event => updateHouseForm("mortgageCurrentBalance", event.target.value)} /></label>
            <label>Mortgage start date<input type="date" value={houseForm.mortgageStartDate} onChange={event => updateHouseForm("mortgageStartDate", event.target.value)} /></label>
            <label>Term years<input type="number" min="0" step="1" value={houseForm.mortgageTermYears} onChange={event => updateHouseForm("mortgageTermYears", event.target.value)} /></label>
            <label>Remaining term months<input type="number" min="0" step="1" value={houseForm.mortgageRemainingTermMonths} onChange={event => updateHouseForm("mortgageRemainingTermMonths", event.target.value)} /></label>
            <label>Repayment type<select value={houseForm.mortgageRepaymentType} onChange={event => updateHouseForm("mortgageRepaymentType", event.target.value)}>
              <option value="repayment">Repayment</option>
              <option value="interestOnly">Interest-only</option>
              <option value="partAndPart">Part-and-part</option>
            </select></label>
            <label>Interest rate %<input type="number" min="0" step="0.01" value={houseForm.mortgageInterestRate} onChange={event => updateHouseForm("mortgageInterestRate", event.target.value)} /></label>
            <label>Rate type<select value={houseForm.mortgageRateType} onChange={event => updateHouseForm("mortgageRateType", event.target.value)}>
              <option value="fixed">Fixed</option>
              <option value="variable">Variable</option>
              <option value="tracker">Tracker</option>
            </select></label>
            <label>Fixed period end<input type="date" value={houseForm.mortgageFixedEndDate} onChange={event => updateHouseForm("mortgageFixedEndDate", event.target.value)} /></label>
            <label>Follow-on rate %<input type="number" min="0" step="0.01" value={houseForm.mortgageFollowOnRate} onChange={event => updateHouseForm("mortgageFollowOnRate", event.target.value)} /></label>
            <label>Monthly repayment<input type="number" min="0" step="0.01" value={houseForm.mortgageMonthlyPayment} onChange={event => updateHouseForm("mortgageMonthlyPayment", event.target.value)} /></label>
            <label>Payment day<input type="number" min="1" max="28" step="1" value={houseForm.mortgagePaymentDay} onChange={event => updateHouseForm("mortgagePaymentDay", event.target.value)} /></label>
            <label>Monthly overpayment<input type="number" min="0" step="0.01" value={houseForm.mortgagePlannedMonthlyOverpayment} onChange={event => updateHouseForm("mortgagePlannedMonthlyOverpayment", event.target.value)} /></label>
            <label>Overpayment allowance %<input type="number" min="0" step="0.1" value={houseForm.mortgageOverpaymentAllowancePercent} onChange={event => updateHouseForm("mortgageOverpaymentAllowancePercent", event.target.value)} /></label>
            <label>Linked tracked account<select value={houseForm.linkedAccountId} onChange={event => updateHouseForm("linkedAccountId", event.target.value)}>
              <option value="">None</option>
              {accounts.filter(account => account.isActive !== false).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select></label>
            <label className="checkbox-label full-width">
              <input type="checkbox" checked={houseForm.mortgageEarlyRepaymentChargeApplies} onChange={event => updateHouseForm("mortgageEarlyRepaymentChargeApplies", event.target.checked)} />
              Early repayment charge may apply
            </label>
            <label className="full-width">Mortgage notes<textarea value={houseForm.mortgageNotes} onChange={event => updateHouseForm("mortgageNotes", event.target.value)} placeholder="Lender, product, ERC notes, statement notes..." /></label>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={closeHouseModal}>Cancel</button>
          <button className="primary-button">{editingHouse ? "Save house" : "Add house"}</button>
        </div>
      </form>
    </div>
  );
}
