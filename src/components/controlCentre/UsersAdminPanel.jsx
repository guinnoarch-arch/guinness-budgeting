import { formatDateTime, isMissingAdminSqlError } from "./controlCentreFormat.js";
import AsyncButton from "../common/AsyncButton.jsx";
import { ControlStat, StatusBadge } from "./ControlCentreParts.jsx";

// Searching users and promoting, pausing or blocking them.
export function UsersAdminPanel({ adminStatus, adminUserCount, blockUser, blockedCount, demoteUser, filteredUsers, pauseUser, pausedCount, promoteUser, refreshUsers, resumeUser, setUserFilter, setUserSearch, unblockUser, userFilter, userListLoaded, userSearch, userStatValue, userStatus, users }) {
  return (
    <div className="card control-panel users-admin-panel">
      <div className="panel-heading admin-users-heading">
        <div>
          <h3>Users / Accounts</h3>
          <p>Manage safe account access metadata only. Financial records are not shown here.</p>
        </div>
        <div className="control-stat-grid admin-users-mini-stats">
          <ControlStat label="Total users" value={userStatValue(users.length)} />
          <ControlStat label="Admins" value={userStatValue(adminUserCount)} />
          <ControlStat label="Blocked" value={userStatValue(blockedCount)} />
          <ControlStat label="Paused" value={userStatValue(pausedCount)} />
        </div>
      </div>

      <div className="admin-user-tools">
        <input
          value={userSearch}
          onChange={event => setUserSearch(event.target.value)}
          placeholder="Search username or email"
          aria-label="Search users"
        />
        <div className="segmented-control admin-filter-tabs" role="group" aria-label="User filter">
          {[
            ["all", "All"],
            ["admins", "Admins"],
            ["users", "Users"],
            ["blocked", "Blocked"],
            ["paused", "Paused"]
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={userFilter === key ? "active" : ""}
              onClick={() => setUserFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <AsyncButton busyLabel="Refreshing…" type="button" className="secondary-button small" onClick={refreshUsers}>Refresh</AsyncButton>
      </div>

      {userStatus && (
        <p className={`cloud-status-message compact-status ${isMissingAdminSqlError(userStatus) ? "warning-status" : ""}`.trim()}>
          {userStatus}
        </p>
      )}

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Activity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              const isOnlyAdmin = user.is_admin && (adminStatus.adminCount <= 1 || users.filter(item => item.is_admin && !item.blocked && !item.paused).length <= 1);
              const isSelf = user.id === adminStatus.currentUserId;
              return (
                <tr key={user.id}>
                  <td data-label="User">
                    <strong>{user.username || "Unnamed user"}</strong>
                    <small>{user.email || "Email not available"}</small>
                    <small>{user.id}</small>
                  </td>
                  <td data-label="Role">
                    <StatusBadge tone={user.is_admin ? "storage-ok" : ""}>{user.is_admin ? "Admin" : "User"}</StatusBadge>
                  </td>
                  <td data-label="Status">
                    <div className="admin-badge-stack">
                      {user.blocked && <StatusBadge tone="expense">Blocked</StatusBadge>}
                      {user.paused && <StatusBadge tone="warning">Paused</StatusBadge>}
                      {!user.blocked && !user.paused && <StatusBadge tone="storage-ok">Active</StatusBadge>}
                    </div>
                  </td>
                  <td data-label="Activity">
                    <small>Created {formatDateTime(user.created_at)}</small>
                    <small>Updated {formatDateTime(user.updated_at)}</small>
                    <small>Last activity {formatDateTime(user.last_activity_at || user.updated_at)}</small>
                  </td>
                  <td data-label="Actions">
                    <div className="admin-user-actions">
                      {!user.is_admin ? (
                        <AsyncButton busyLabel="Saving…" type="button" className="secondary-button small" onClick={() => promoteUser(user)}>
                          Promote to admin
                        </AsyncButton>
                      ) : (
                        <AsyncButton busyLabel="Saving…" type="button" className="secondary-button small" onClick={() => demoteUser(user)} disabled={isOnlyAdmin}>
                          Demote to user
                        </AsyncButton>
                      )}
                      {user.blocked ? (
                        <AsyncButton busyLabel="Saving…" type="button" className="secondary-button small" onClick={() => unblockUser(user)}>
                          Unblock
                        </AsyncButton>
                      ) : (
                        <AsyncButton busyLabel="Saving…" type="button" className="danger-button small" onClick={() => blockUser(user)} disabled={isOnlyAdmin || (isSelf && isOnlyAdmin)}>
                          Block
                        </AsyncButton>
                      )}
                      {user.paused ? (
                        <AsyncButton busyLabel="Saving…" type="button" className="secondary-button small" onClick={() => resumeUser(user)}>
                          Resume
                        </AsyncButton>
                      ) : (
                        <AsyncButton busyLabel="Saving…" type="button" className="secondary-button small" onClick={() => pauseUser(user)} disabled={isOnlyAdmin || (isSelf && isOnlyAdmin)}>
                          Pause
                        </AsyncButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {userListLoaded && filteredUsers.length === 0 && <p className="muted-text">No users match this filter.</p>}
        {!userListLoaded && <p className="muted-text">User list is unavailable until the admin SQL setup has been run.</p>}
      </div>
    </div>
  );
}
