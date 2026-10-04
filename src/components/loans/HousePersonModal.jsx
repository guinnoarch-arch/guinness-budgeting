import { FieldError, RequiredMark } from "../common/FormFeedback.jsx";

export function HousePersonModal({ house, personForm, updatePersonForm, submitPerson, closePersonModal, validation }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submitPerson} noValidate>
        <div className="section-header">
          <h2>Add person: {house.name}</h2>
          <button type="button" className="icon-button" onClick={closePersonModal} aria-label="Close">×</button>
        </div>
        <div className="form-grid">
          <label>
            <span>Name<RequiredMark /></span>
            <input {...validation.fieldProps("name")} aria-required="true" value={personForm.name} onChange={event => updatePersonForm("name", event.target.value)} />
            <FieldError fieldId={validation.getFieldId("name")} message={validation.errors.name} />
          </label>
          <label>Email / optional<input type="email" value={personForm.email} onChange={event => updatePersonForm("email", event.target.value)} /></label>
          <label>Label<input value={personForm.label} onChange={event => updatePersonForm("label", event.target.value)} placeholder="Partner, parent, solicitor" /></label>
          <label>Manual ownership %<input type="number" min="0" max="100" step="0.01" value={personForm.ownershipPercentage} onChange={event => updatePersonForm("ownershipPercentage", event.target.value)} /></label>
        </div>
        <p className="muted-text">Manual ownership is separate from contribution tracking and does not change account balances.</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={closePersonModal}>Cancel</button>
          <button className="primary-button">Add person</button>
        </div>
      </form>
    </div>
  );
}
