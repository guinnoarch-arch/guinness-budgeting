import { useEffect, useMemo, useState } from "react";
import {
  APP_VERSION,
  DATA_SCHEMA_VERSION,
  getBackupReminder,
  getStorageHealth
} from "../services/storageService.js";
import {
  FEATURE_FLAG_DETAILS,
  STABLE_PRODUCTION_APP_URL,
  clearBroadcast,
  getAdminStatus,
  getFeatureFlags,
  listAdminFeatureSuggestions,
  listAdminAuditLog,
  listAdminUsers,
  sendBroadcast,
  setAdminClaimMode,
  setAdminUserBlocked,
  setAdminUserPaused,
  setAdminUserRole,
  setAppStatus,
  setFeatureFlag,
  updateAdminFeatureSuggestion
} from "../services/adminService.js";
import { isCloudBackupConfigured } from "../services/cloudBackupService.js";

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusClass(ok) {
  return ok ? "status-ok" : "status-warning";
}

function ControlStat({ label, value, detail }) {
  return (
    <div className="control-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function SecurityCheck({ label, ok, detail }) {
  return (
    <div className={`security-check ${statusClass(ok)}`}>
      <span>{ok ? "OK" : "Check"}</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function StatusBadge({ children, tone = "" }) {
  return <span className={`pill admin-status-badge ${tone}`.trim()}>{children}</span>;
}

function isMissingAdminSqlError(message = "") {
  return /admin sql setup has not been run yet|gh_admin_list_users|schema cache|function .*not found|could not find the function/i.test(String(message || ""));
}

function getPublicUrlCheck() {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_APP_PUBLIC_URL || "").trim();
  if (!configured) {
    return {
      ok: false,
      detail: `Missing. Set VITE_PUBLIC_APP_URL to ${STABLE_PRODUCTION_APP_URL} in Vercel.`
    };
  }

  try {
    const url = new URL(configured);
    const ok = url.href.replace(/\/$/, "") === STABLE_PRODUCTION_APP_URL;
    return {
      ok,
      detail: ok ? "Production URL is configured." : `Configured as ${url.href}; expected ${STABLE_PRODUCTION_APP_URL}.`
    };
  } catch {
    return { ok: false, detail: "Configured value is not a valid URL." };
  }
}

export default function ControlCentrePage({ appData, actions }) {
  const settings = appData.settings || {};
  const featureFlags = getFeatureFlags(settings);
  const adminStatus = actions.adminStatus || getAdminStatus(actions.adminAccessState, actions.cloudAuthSummary);
  const [accessStatus, setAccessStatus] = useState("");
  const [auditLog, setAuditLog] = useState([]);
  const [auditStatus, setAuditStatus] = useState("");
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [userStatus, setUserStatus] = useState("");
  const [userListLoaded, setUserListLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionFilter, setSuggestionFilter] = useState("all");
  const [suggestionStatus, setSuggestionStatus] = useState("");
  const appNotices = actions.appNotices || { maintenanceMode: false, maintenanceMessage: "", broadcast: null };
  const [maintenanceDraft, setMaintenanceDraft] = useState(() => appNotices.maintenanceMessage || "");
  const [maintenanceStatus, setMaintenanceStatus] = useState("");
  const [broadcastDraft, setBroadcastDraft] = useState("");
  const [broadcastSeverity, setBroadcastSeverity] = useState("info");
  const [broadcastStatus, setBroadcastStatus] = useState("");
  const storageHealth = useMemo(() => getStorageHealth(appData), [appData]);
  const backupReminder = getBackupReminder(settings);
  const publicUrlCheck = getPublicUrlCheck();
  const cloudConfigured = isCloudBackupConfigured(settings);
  const cloud = settings.cloudBackup || {};

  function toggleFlag(key) {
    const nextValue = !featureFlags[key];
    actions.updateAppData(prev => ({
      ...prev,
      settings: setFeatureFlag(prev.settings || {}, key, nextValue, { email: adminStatus.email })
    }), { reason: `Admin feature flag changed: ${key}`, markDirty: false });
  }

  async function toggleAdminClaimMode() {
    const nextValue = !adminStatus.adminClaimEnabled;
    setAccessStatus(nextValue ? "Turning admin claim mode on..." : "Turning admin claim mode off...");
    try {
      await setAdminClaimMode(settings, nextValue);
      await actions.refreshAdminAccess?.();
      setAccessStatus(nextValue
        ? "Admin claim mode is ON. Only keep this enabled while inviting a trusted user."
        : "Admin claim mode is OFF.");
    } catch (error) {
      setAccessStatus(error.message || "Could not update admin claim mode.");
    }
  }

  async function refreshUsers() {
    if (!adminStatus.isAdmin) return;
    setUserStatus("");
    setUserListLoaded(false);
    try {
      const rows = await listAdminUsers(settings);
      setUsers(rows);
      setUserListLoaded(true);
    } catch (error) {
      setUsers([]);
      setUserStatus(isMissingAdminSqlError(error.message)
        ? "Admin SQL setup has not been run yet. Run the latest Supabase SQL setup, wait 30-60 seconds for the schema cache, then refresh."
        : error.message || "Could not load users.");
    }
  }

  async function refreshAuditLog() {
    if (!adminStatus.isAdmin) return;
    setAuditStatus("");
    try {
      const rows = await listAdminAuditLog(settings, 30);
      setAuditLog(rows);
    } catch (error) {
      setAuditStatus(error.message || "Could not load admin audit log.");
    }
  }

  async function refreshSuggestions(filter = suggestionFilter) {
    if (!adminStatus.isAdmin) return;
    setSuggestionStatus("");
    try {
      const rows = await listAdminFeatureSuggestions(settings, filter);
      setSuggestions(rows);
    } catch (error) {
      setSuggestions([]);
      setSuggestionStatus(isMissingAdminSqlError(error.message) || /gh_admin_list_feature_suggestions|gh_feature_suggestions/i.test(String(error.message || ""))
        ? "Suggestion SQL setup has not been run yet. Run the latest Supabase SQL setup, wait 30-60 seconds, then refresh."
        : error.message || "Could not load feature suggestions.");
    }
  }

  async function updateSuggestion(item, patch) {
    setSuggestionStatus("Updating suggestion...");
    try {
      await updateAdminFeatureSuggestion(settings, item.id, patch.status || item.status, patch.admin_note ?? item.admin_note ?? "");
      setSuggestionStatus("Suggestion updated.");
      await Promise.all([refreshSuggestions(), refreshAuditLog()]);
    } catch (error) {
      setSuggestionStatus(error.message || "Could not update suggestion.");
    }
  }

  async function promoteUser(user) {
    if (!confirm("Are you sure you want to make this user an admin?")) return;
    setUserStatus("Promoting user...");
    try {
      await setAdminUserRole(settings, user.id, "admin");
      setUserStatus(`${user.username || user.email || "User"} is now admin.`);
      await Promise.all([refreshUsers(), refreshAuditLog(), actions.refreshAdminAccess?.()]);
    } catch (error) {
      setUserStatus(error.message || "Could not promote user.");
    }
  }

  async function demoteUser(user) {
    if (user.is_admin && adminStatus.adminCount <= 1) {
      setUserStatus("Cannot remove the last admin.");
      return;
    }
    if (!confirm("Are you sure you want to demote this admin to user?")) return;
    setUserStatus("Demoting user...");
    try {
      await setAdminUserRole(settings, user.id, "user");
      setUserStatus(`${user.username || user.email || "User"} is now a user.`);
      await Promise.all([refreshUsers(), refreshAuditLog(), actions.refreshAdminAccess?.()]);
    } catch (error) {
      setUserStatus(error.message || "Could not demote user.");
    }
  }

  async function blockUser(user) {
    if (user.is_admin && adminStatus.adminCount <= 1) {
      setUserStatus("Cannot block the last admin.");
      return;
    }
    if (user.id === adminStatus.currentUserId && user.is_admin) {
      const allowSelfBlock = users.some(item => item.id !== user.id && item.is_admin && !item.blocked);
      if (!allowSelfBlock) {
        setUserStatus("Cannot block the last admin.");
        return;
      }
      if (!confirm("You are about to block your own admin account. Another active admin will need to unblock you. Continue?")) return;
    } else if (!confirm("Block this user account? This does not delete data, but it stops access and cloud sync.")) {
      return;
    }

    setUserStatus("Blocking user...");
    try {
      await setAdminUserBlocked(settings, user.id, true);
      setUserStatus(`${user.username || user.email || "User"} has been blocked.`);
      await Promise.all([refreshUsers(), refreshAuditLog(), actions.refreshAdminAccess?.()]);
    } catch (error) {
      setUserStatus(error.message || "Could not block user.");
    }
  }

  async function unblockUser(user) {
    if (!confirm("Unblock this user account?")) return;
    setUserStatus("Unblocking user...");
    try {
      await setAdminUserBlocked(settings, user.id, false);
      setUserStatus(`${user.username || user.email || "User"} has been unblocked.`);
      await Promise.all([refreshUsers(), refreshAuditLog(), actions.refreshAdminAccess?.()]);
    } catch (error) {
      setUserStatus(error.message || "Could not unblock user.");
    }
  }

  async function pauseUser(user) {
    if (user.is_admin && adminStatus.adminCount <= 1) {
      setUserStatus("Cannot pause the last admin.");
      return;
    }
    if (user.id === adminStatus.currentUserId && user.is_admin) {
      const allowSelfPause = users.some(item => item.id !== user.id && item.is_admin && !item.blocked && !item.paused);
      if (!allowSelfPause) {
        setUserStatus("Cannot pause the last admin.");
        return;
      }
      if (!confirm("You are about to pause your own admin account. Another active admin will need to resume you. Continue?")) return;
    } else if (!confirm("Pause this user account? Unlike blocking, this is meant as a temporary suspension - it stops access and cloud sync but does not delete data.")) {
      return;
    }

    setUserStatus("Pausing user...");
    try {
      await setAdminUserPaused(settings, user.id, true);
      setUserStatus(`${user.username || user.email || "User"} has been paused.`);
      await Promise.all([refreshUsers(), refreshAuditLog(), actions.refreshAdminAccess?.()]);
    } catch (error) {
      setUserStatus(error.message || "Could not pause user.");
    }
  }

  async function resumeUser(user) {
    if (!confirm("Resume this user account?")) return;
    setUserStatus("Resuming user...");
    try {
      await setAdminUserPaused(settings, user.id, false);
      setUserStatus(`${user.username || user.email || "User"} has been resumed.`);
      await Promise.all([refreshUsers(), refreshAuditLog(), actions.refreshAdminAccess?.()]);
    } catch (error) {
      setUserStatus(error.message || "Could not resume user.");
    }
  }

  async function saveMaintenanceStatus(nextEnabled) {
    setMaintenanceStatus(nextEnabled ? "Turning maintenance mode on..." : "Turning maintenance mode off...");
    try {
      await setAppStatus(settings, nextEnabled, maintenanceDraft);
      await Promise.all([actions.refreshAppNotices?.(), refreshAuditLog()]);
      setMaintenanceStatus(nextEnabled ? "Maintenance mode is ON for everyone except admins." : "Maintenance mode is OFF.");
    } catch (error) {
      setMaintenanceStatus(error.message || "Could not update maintenance mode.");
    }
  }

  async function sendBroadcastMessage(event) {
    event.preventDefault();
    setBroadcastStatus("Sending...");
    try {
      await sendBroadcast(settings, broadcastDraft, broadcastSeverity);
      setBroadcastDraft("");
      await Promise.all([actions.refreshAppNotices?.(), refreshAuditLog()]);
      setBroadcastStatus("Message sent to all signed-in users.");
    } catch (error) {
      setBroadcastStatus(error.message || "Could not send message.");
    }
  }

  async function clearBroadcastMessage() {
    if (!confirm("Clear the active broadcast message for everyone?")) return;
    setBroadcastStatus("Clearing...");
    try {
      await clearBroadcast(settings);
      await Promise.all([actions.refreshAppNotices?.(), refreshAuditLog()]);
      setBroadcastStatus("Broadcast cleared.");
    } catch (error) {
      setBroadcastStatus(error.message || "Could not clear message.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAdminLists() {
      if (!adminStatus.isAdmin) return;
      await Promise.all([
        listAdminUsers(settings).then(rows => {
          if (!cancelled) {
            setUsers(rows);
            setUserListLoaded(true);
          }
        }).catch(error => {
          if (!cancelled) {
            setUsers([]);
            setUserListLoaded(false);
            setUserStatus(isMissingAdminSqlError(error.message)
              ? "Admin SQL setup has not been run yet. Run the latest Supabase SQL setup, wait 30-60 seconds for the schema cache, then refresh."
              : error.message || "Could not load users.");
          }
        }),
        listAdminAuditLog(settings, 30).then(rows => {
          if (!cancelled) setAuditLog(rows);
        }).catch(error => {
          if (!cancelled) setAuditStatus(error.message || "Could not load admin audit log.");
        }),
        listAdminFeatureSuggestions(settings, suggestionFilter).then(rows => {
          if (!cancelled) setSuggestions(rows);
        }).catch(error => {
          if (!cancelled) {
            setSuggestions([]);
            setSuggestionStatus(/gh_admin_list_feature_suggestions|gh_feature_suggestions|schema cache|function .*not found|could not find the function/i.test(String(error.message || ""))
              ? "Suggestion SQL setup has not been run yet. Run the latest Supabase SQL setup, wait 30-60 seconds, then refresh."
              : error.message || "Could not load feature suggestions.");
          }
        })
      ]);
    }

    loadAdminLists();
    return () => {
      cancelled = true;
    };
  }, [adminStatus.isAdmin, adminStatus.adminClaimEnabled, suggestionFilter, settings.cloudBackup?.supabaseUrl, settings.cloudBackup?.supabaseAnonKey]);

  const filteredUsers = users.filter(user => {
    const query = userSearch.trim().toLowerCase();
    const matchesSearch = !query || [user.username, user.email].some(value => String(value || "").toLowerCase().includes(query));
    const matchesFilter = userFilter === "all"
      || (userFilter === "admins" && user.is_admin)
      || (userFilter === "users" && !user.is_admin)
      || (userFilter === "blocked" && user.blocked)
      || (userFilter === "paused" && user.paused);
    return matchesSearch && matchesFilter;
  });

  const blockedCount = users.filter(user => user.blocked).length;
  const pausedCount = users.filter(user => user.paused).length;
  const adminUserCount = users.filter(user => user.is_admin).length;
  const userStatValue = (value) => userListLoaded ? value : "Setup needed";

  if (!adminStatus.isAdmin) {
    return (
      <section className="page-grid control-centre-page">
        <div className="card control-access-card">
          <p className="eyebrow">Control Centre</p>
          <h2>Not authorised</h2>
          <p className="muted-text">{adminStatus.reason}</p>
          <div className="cloud-status-message compact-status warning-status">
            Admin access is checked by Supabase RPCs against public.profiles.role = 'admin'. Run the updated Supabase SQL setup if this route should be available to your account.
          </div>
          <button type="button" className="primary-button" onClick={actions.openSettingsProfile}>
            Back to Budgeting
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page-grid control-centre-page">
      <div className="page-heading">
        <div>
          <button type="button" className="secondary-button small control-back-button" onClick={actions.openSettingsProfile}>
            Back to Budgeting
          </button>
          <p className="eyebrow">Admin</p>
          <h2>Control Centre</h2>
        </div>
        <span className="pill storage-ok">Protected</span>
      </div>

      <div className="control-centre-grid">
        <div className="card control-panel">
          <div className="panel-heading">
            <div>
              <h3>Overview</h3>
              <p>Operational status for this app instance.</p>
            </div>
          </div>
          <div className="control-stat-grid">
            <ControlStat label="App version" value={`V${APP_VERSION}`} detail={`Data ${DATA_SCHEMA_VERSION}`} />
            <ControlStat label="Storage" value={storageHealth.status} detail={storageHealth.storageType} />
            <ControlStat label="Backup" value={backupReminder.title} detail={backupReminder.message} />
            <ControlStat label="Cloud backup" value={cloudConfigured ? "Configured" : "Not configured"} detail={cloud.lastCloudBackupAt ? `Last ${formatDateTime(cloud.lastCloudBackupAt)}` : "No cloud backup timestamp"} />
          </div>
        </div>

        <div className="card control-panel">
          <div className="panel-heading">
            <div>
              <h3>User/account stats</h3>
              <p>Safe profile counts from Supabase plus local browser counts.</p>
            </div>
          </div>
          <div className="control-stat-grid">
            <ControlStat label="Supabase profiles" value={adminStatus.profileCount || 0} detail="Server-side count from the admin access RPC." />
            <ControlStat label="Supabase admins" value={adminStatus.adminCount || 0} />
            <ControlStat label="Local profiles" value={storageHealth.counts.profiles} />
            <ControlStat label="Local accounts" value={storageHealth.counts.accounts} />
            <ControlStat label="Local imports" value={storageHealth.counts.importBatches} />
          </div>
        </div>
      </div>

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
          <button type="button" className="secondary-button small" onClick={refreshUsers}>Refresh</button>
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
                          <button type="button" className="secondary-button small" onClick={() => promoteUser(user)}>
                            Promote to admin
                          </button>
                        ) : (
                          <button type="button" className="secondary-button small" onClick={() => demoteUser(user)} disabled={isOnlyAdmin}>
                            Demote to user
                          </button>
                        )}
                        {user.blocked ? (
                          <button type="button" className="secondary-button small" onClick={() => unblockUser(user)}>
                            Unblock
                          </button>
                        ) : (
                          <button type="button" className="danger-button small" onClick={() => blockUser(user)} disabled={isOnlyAdmin || (isSelf && isOnlyAdmin)}>
                            Block
                          </button>
                        )}
                        {user.paused ? (
                          <button type="button" className="secondary-button small" onClick={() => resumeUser(user)}>
                            Resume
                          </button>
                        ) : (
                          <button type="button" className="secondary-button small" onClick={() => pauseUser(user)} disabled={isOnlyAdmin || (isSelf && isOnlyAdmin)}>
                            Pause
                          </button>
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

      <div className="card control-panel users-admin-panel">
        <div className="panel-heading admin-users-heading">
          <div>
            <h3>Feature suggestions</h3>
            <p>Safe user-submitted app ideas. No financial records are shown here.</p>
          </div>
          <button type="button" className="secondary-button small" onClick={() => refreshSuggestions()}>Refresh</button>
        </div>

        <div className="admin-user-tools">
          <div className="segmented-control admin-filter-tabs" role="group" aria-label="Suggestion filter">
            {["all", "new", "reviewed", "planned", "in_progress", "done", "rejected"].map(key => (
              <button
                key={key}
                type="button"
                className={suggestionFilter === key ? "active" : ""}
                onClick={() => setSuggestionFilter(key)}
              >
                {key === "all" ? "All" : key.replace("_", " ").replace(/^\w/, char => char.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        {suggestionStatus && <p className="cloud-status-message compact-status warning-status">{suggestionStatus}</p>}

        <div className="suggestion-list">
          {suggestions.length === 0 ? (
            <p className="muted-text">No feature suggestions match this filter.</p>
          ) : suggestions.map(item => (
            <div className="suggestion-row" key={item.id}>
              <div>
                <strong>{item.message}</strong>
                <small>
                  {item.submitted_username || item.submitted_email || "Unknown user"} - {formatDateTime(item.created_at)}
                </small>
                <small>Votes: +{item.up_votes || 0} / -{item.down_votes || 0}</small>
                {item.admin_note && <small>Admin note: {item.admin_note}</small>}
              </div>
              <div className="admin-user-actions">
                <select
                  value={item.status || "new"}
                  onChange={event => updateSuggestion(item, { status: event.target.value })}
                >
                  <option value="new">New</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="planned">Planned</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                  <option value="rejected">Rejected</option>
                </select>
                <button
                  type="button"
                  className="secondary-button small"
                  onClick={() => {
                    const note = prompt("Admin note", item.admin_note || "");
                    if (note !== null) updateSuggestion(item, { admin_note: note });
                  }}
                >
                  Note
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

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

      <div className="control-centre-grid">
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
              <button type="button" className="danger-button" onClick={() => saveMaintenanceStatus(false)}>
                Turn maintenance mode OFF
              </button>
            ) : (
              <button type="button" className="secondary-button" onClick={() => saveMaintenanceStatus(true)}>
                Turn maintenance mode ON
              </button>
            )}
          </div>
          {maintenanceStatus && <p className="cloud-status-message compact-status">{maintenanceStatus}</p>}
        </div>

        <div className="card control-panel">
          <div className="panel-heading">
            <div>
              <h3>Broadcast message</h3>
              <p>Pops up on every signed-in user's screen until they dismiss it.</p>
            </div>
          </div>
          {appNotices.broadcast ? (
            <div className={`cloud-status-message compact-status broadcast-${appNotices.broadcast.severity}`}>
              Active ({appNotices.broadcast.severity}): {appNotices.broadcast.message}
            </div>
          ) : (
            <p className="muted-text">No broadcast message is currently active.</p>
          )}
          <form className="suggestion-form" onSubmit={sendBroadcastMessage}>
            <textarea
              value={broadcastDraft}
              onChange={event => setBroadcastDraft(event.target.value)}
              placeholder="e.g. New transfer linking feature shipped today - see Import for details."
              rows={2}
              required
            />
            <select value={broadcastSeverity} onChange={event => setBroadcastSeverity(event.target.value)}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="urgent">Urgent</option>
            </select>
            <button className="primary-button" type="submit">Send to all users</button>
          </form>
          {appNotices.broadcast && (
            <div className="row-actions">
              <button type="button" className="secondary-button small" onClick={clearBroadcastMessage}>Clear active message</button>
            </div>
          )}
          {broadcastStatus && <p className="cloud-status-message compact-status">{broadcastStatus}</p>}
        </div>
      </div>

      <div className="control-centre-grid">
        <div className="card control-panel">
          <div className="panel-heading">
            <div>
              <h3>Backup/sync health</h3>
              <p>Cloud backup and local storage signals for this browser.</p>
            </div>
          </div>
          <div className="control-stat-grid">
            <ControlStat label="Cloud configured" value={cloudConfigured ? "Yes" : "No"} />
            <ControlStat label="Last cloud backup" value={formatDateTime(cloud.lastCloudBackupAt)} />
            <ControlStat label="Cloud backup needed" value={cloud.cloudBackupNeeded ? "Yes" : "No"} />
            <ControlStat label="Storage used" value={storageHealth.storagePercent !== null && storageHealth.storagePercent !== undefined ? `${storageHealth.storagePercent}%` : "Not reported"} />
          </div>
        </div>

        <div className="card control-panel">
          <div className="panel-heading">
            <div>
              <h3>Security checks</h3>
              <p>Checks that keep browser admin tools honest.</p>
            </div>
          </div>
          <div className="security-check-list">
            <SecurityCheck label="Admin account" ok={adminStatus.isAdmin} detail={adminStatus.reason} />
            <SecurityCheck label="Stable public URL" ok={publicUrlCheck.ok} detail={publicUrlCheck.detail} />
            <SecurityCheck label="Cloud backup config" ok={cloudConfigured} detail={cloudConfigured ? "Supabase cloud backup settings are present." : "Set Supabase URL and anon key before relying on cloud restore."} />
            <SecurityCheck label="Service worker update flow" ok={Boolean(actions.pwaInstall?.serviceWorkerReady || actions.pwaInstall?.hasUpdateAvailable)} detail={actions.pwaInstall?.hasUpdateAvailable ? "An update is ready to apply." : "Registered when supported; cache version changes with app releases."} />
            <SecurityCheck label="Global data access" ok detail="Only safe profile/admin counts come from RPCs. Cross-user financial data and service-role keys are not available in the browser." />
          </div>
        </div>
      </div>

      <div className="control-centre-grid">
        <div className="card control-panel">
          <div className="panel-heading">
            <div>
              <h3>Audit log</h3>
              <p>Recent server-side admin changes.</p>
            </div>
          </div>
          <div className="admin-audit-list">
            {auditStatus && <p className="cloud-status-message compact-status warning-status">{auditStatus}</p>}
            {auditLog.length === 0 ? (
              <p className="muted-text">No admin actions recorded yet.</p>
            ) : (
              auditLog.map(entry => (
                <div className="admin-audit-row" key={entry.id || `${entry.action}-${entry.created_at}`}>
                  <strong>{entry.action}</strong>
                  <span>{entry.actor_email || "unknown"} - {formatDateTime(entry.created_at)}</span>
                  {entry.details && <small>{JSON.stringify(entry.details)}</small>}
                </div>
              ))
            )}
          </div>
        </div>

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
            <button type="button" className={adminStatus.adminClaimEnabled ? "danger-button" : "secondary-button"} onClick={toggleAdminClaimMode}>
              {adminStatus.adminClaimEnabled ? "Turn admin-claim mode OFF" : "Allow another user to become admin"}
            </button>
          </div>
          <p className="muted-text">
            The first user can become admin only while no admin exists. After any successful claim, admin-claim mode is automatically turned off by Supabase.
          </p>
          {accessStatus && <p className="cloud-status-message compact-status">{accessStatus}</p>}
        </div>
      </div>
    </section>
  );
}
