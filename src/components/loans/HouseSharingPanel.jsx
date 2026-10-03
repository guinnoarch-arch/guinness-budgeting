import { useState } from "react";
import { HOUSE_MEMBER_ROLES } from "../../utils/houseTracking.js";

// New members are invited as a viewer or editor; ownership isn't handed out
// by invitation.
const INVITABLE_HOUSE_ROLES = HOUSE_MEMBER_ROLES.filter(([value]) => value !== "owner");

export function HouseSharingPanel({
  house,
  members,
  invites,
  role,
  sharingStatus,
  sharingBusy,
  canManageSharing,
  onRefresh,
  onPublish,
  onInvite,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onChangeMemberRole,
  onRemoveMember
}) {
  const [identifier, setIdentifier] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const pendingInvites = invites.filter(invite => invite.status === "pending");
  const acceptedInvites = invites.filter(invite => invite.status === "accepted");
  const setupMissing = /setup has not been run/i.test(String(sharingStatus || ""));

  function submitInvite(event) {
    event.preventDefault();
    onInvite(identifier, inviteRole);
    setIdentifier("");
  }

  return (
    <div className="house-sharing-panel">
      <div className="section-header compact-header">
        <div>
          <h4>Shared users</h4>
          <p className="muted-text">Role: {role}. Shared users receive only house details, people, splits and safe contributions.</p>
        </div>
        <button type="button" className="secondary-button small" onClick={onRefresh} disabled={Boolean(sharingBusy)}>Refresh</button>
      </div>

      {sharingStatus && (
        <div className={setupMissing ? "backup-warning-box" : "success-note"}>
          {sharingStatus}
        </div>
      )}

      <div className="row-actions">
        <button type="button" className="primary-button" onClick={onPublish} disabled={Boolean(sharingBusy) || !canManageSharing}>
          {house.sharedRole ? "Sync shared house" : "Enable sharing"}
        </button>
      </div>

      {canManageSharing ? (
        <form className="house-share-form" onSubmit={submitInvite}>
          <label>Email or username<input value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="friend@example.com" /></label>
          <label>Role<select value={inviteRole} onChange={event => setInviteRole(event.target.value)}>
            {INVITABLE_HOUSE_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <button className="secondary-button" disabled={Boolean(sharingBusy)}>Invite</button>
        </form>
      ) : (
        <p className="muted-text">Only house owners can invite users or change access.</p>
      )}

      <div className="house-person-list">
        {members.length === 0 ? (
          <p className="muted-text">No shared members loaded yet. Enable sharing or refresh after running the SQL setup.</p>
        ) : members.map(member => (
          <div key={member.userId || member.email} className="house-person-row">
            <div>
              <strong>{member.username || member.email || "Shared user"}</strong>
              <small>{member.email || member.userId}</small>
            </div>
            <div className="row-actions">
              {canManageSharing ? (
                <select value={member.role || "viewer"} onChange={event => onChangeMemberRole(member, event.target.value)} disabled={Boolean(sharingBusy)}>
                  {HOUSE_MEMBER_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              ) : (
                <strong>{member.role}</strong>
              )}
              {canManageSharing && <button type="button" className="danger-button small" onClick={() => onRemoveMember(member)} disabled={Boolean(sharingBusy)}>Remove</button>}
            </div>
          </div>
        ))}
      </div>

      {pendingInvites.length > 0 && (
        <div className="house-person-list">
          <h5>Pending invites</h5>
          {pendingInvites.map(invite => (
            <div key={invite.id} className="house-person-row">
              <div>
                <strong>{invite.invitedEmail || "Pending user"}</strong>
                <small>{invite.role} invite</small>
              </div>
              <div className="row-actions">
                {!canManageSharing && <button type="button" className="secondary-button small" onClick={() => onAcceptInvite(invite)} disabled={Boolean(sharingBusy)}>Accept</button>}
                {!canManageSharing && <button type="button" className="secondary-button small" onClick={() => onDeclineInvite(invite)} disabled={Boolean(sharingBusy)}>Decline</button>}
                {canManageSharing && <button type="button" className="danger-button small" onClick={() => onCancelInvite(invite)} disabled={Boolean(sharingBusy)}>Cancel</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {acceptedInvites.length > 0 && <p className="muted-text">{acceptedInvites.length} accepted invite record(s).</p>}
    </div>
  );
}
