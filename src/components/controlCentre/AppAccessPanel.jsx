import AsyncButton from "../common/AsyncButton.jsx";
import { SecurityCheck } from "./ControlCentreParts.jsx";

// Maintenance mode and its message.
export function AppAccessPanel({ appNotices, maintenanceDraft, maintenanceStatus, saveMaintenanceStatus, setMaintenanceDraft }) {
  return (
    <div className="card control-panel">
      <div className="panel-heading">
        <div>
          <h3>App access</h3>
          <p>Unlike feature flags above, this reaches every signed-in user's device, not just this browser.</p>
        </div>
      </div>
      <div className="security-check-list">
        <SecurityCheck
          label="Maintenance mode"
          ok={!appNotices.maintenanceMode}
          detail={appNotices.maintenanceMode ? "ON: everyone except admins is locked out of the app." : "OFF: everyone has normal access."}
        />
      </div>
      <label>
        Message shown while maintenance mode is on
        <textarea
          value={maintenanceDraft}
          onChange={event => setMaintenanceDraft(event.target.value)}
          placeholder="Upgrading the server, back in 10 minutes."
          rows={2}
        />
      </label>
      <div className="row-actions">
        {appNotices.maintenanceMode ? (
          <AsyncButton busyLabel="Saving…" type="button" className="danger-button" onClick={() => saveMaintenanceStatus(false)}>
            Turn maintenance mode OFF
          </AsyncButton>
        ) : (
          <AsyncButton busyLabel="Saving…" type="button" className="secondary-button" onClick={() => saveMaintenanceStatus(true)}>
            Turn maintenance mode ON
          </AsyncButton>
        )}
      </div>
      {maintenanceStatus && <p className="cloud-status-message compact-status">{maintenanceStatus}</p>}
    </div>
  );
}
