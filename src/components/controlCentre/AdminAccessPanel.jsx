import AsyncButton from "../common/AsyncButton.jsx";
import { SecurityCheck } from "./ControlCentreParts.jsx";

// How admin access is granted: by database role or the first-user claim.
export function AdminAccessPanel({ accessStatus, adminStatus, toggleAdminClaimMode }) {
  return (
    <div className="card control-panel">
      <div className="panel-heading">
        <div>
          <h3>Admin access settings</h3>
          <p>Admin access is stored in Supabase profile data, not in frontend-only email checks.</p>
        </div>
      </div>
      <div className="security-check-list">
        <SecurityCheck label="Current user admin status" ok={adminStatus.isAdmin} detail={`${adminStatus.email || "Signed-in user"} has role ${adminStatus.role || "user"}.`} />
        <SecurityCheck label="Admin claim mode" ok={!adminStatus.adminClaimEnabled} detail={adminStatus.adminClaimEnabled ? "ON: a logged-in non-admin can claim admin until someone claims it." : "OFF: only existing admins can enable another claim."} />
      </div>
      <div className="cloud-status-message compact-status warning-status">
        Only enable this when you are intentionally allowing another trusted user to become admin.
      </div>
      <div className="row-actions">
        <AsyncButton busyLabel="Saving…" type="button" className={adminStatus.adminClaimEnabled ? "danger-button" : "secondary-button"} onClick={toggleAdminClaimMode}>
          {adminStatus.adminClaimEnabled ? "Turn admin-claim mode OFF" : "Allow another user to become admin"}
        </AsyncButton>
      </div>
      <p className="muted-text">
        The first user can become admin only while no admin exists. After any successful claim, admin-claim mode is automatically turned off by Supabase.
      </p>
      {accessStatus && <p className="cloud-status-message compact-status">{accessStatus}</p>}
    </div>
  );
}
