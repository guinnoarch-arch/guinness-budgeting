import { FEATURE_FLAG_DETAILS } from "../../services/adminService.js";

// Turning optional features on and off for this app.
export function FeatureFlagsPanel({ featureFlags, toggleFlag }) {
  return (
    <div className="card control-panel">
      <div className="panel-heading">
        <div>
          <h3>Feature flags</h3>
          <p>Flags are local app controls. Bank linking stays off and has no integration behind it.</p>
        </div>
      </div>
      <div className="feature-flag-list">
        {Object.entries(FEATURE_FLAG_DETAILS).map(([key, detail]) => (
          <label className="feature-flag-row" key={key}>
            <span>
              <strong>{detail.label}</strong>
              <small>{detail.description}</small>
            </span>
            <input
              type="checkbox"
              checked={Boolean(featureFlags[key])}
              onChange={() => toggleFlag(key)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
