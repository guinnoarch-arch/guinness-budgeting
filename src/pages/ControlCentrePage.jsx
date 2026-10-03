import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "../utils/errors.js";
import { APP_VERSION, DATA_SCHEMA_VERSION, getBackupReminder, getStorageHealth } from "../services/storageService.js";
import { STABLE_PRODUCTION_APP_URL, clearBroadcast, getAdminStatus, getFeatureFlags, listAdminFeatureSuggestions, listAdminAuditLog, listAdminUsers, sendBroadcast, setAdminClaimMode, setAdminUserBlocked, setAdminUserPaused, setAdminUserRole, setAppStatus, setFeatureFlag, updateAdminFeatureSuggestion } from "../services/adminService.js";
import { isCloudBackupConfigured } from "../services/cloudBackupService.js";
import { formatDateTime, isMissingAdminSqlError } from "../components/controlCentre/controlCentreFormat.js";
import { ControlStat, SecurityCheck } from "../components/controlCentre/ControlCentreParts.jsx";
import { AdminAccessPanel } from "../components/controlCentre/AdminAccessPanel.jsx";
import { AuditLogPanel } from "../components/controlCentre/AuditLogPanel.jsx";
import { BroadcastPanel } from "../components/controlCentre/BroadcastPanel.jsx";
import { AppAccessPanel } from "../components/controlCentre/AppAccessPanel.jsx";
import { FeatureFlagsPanel } from "../components/controlCentre/FeatureFlagsPanel.jsx";
import { SuggestionsAdminPanel } from "../components/controlCentre/SuggestionsAdminPanel.jsx";
import { UsersAdminPanel } from "../components/controlCentre/UsersAdminPanel.jsx";

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
      setAccessStatus(getErrorMessage(error, "Couldn't update admin claim mode. Try again in a moment."));
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
        : getErrorMessage(error, "Couldn't load users. Try again in a moment."));
    }
  }

  async function refreshAuditLog() {
    if (!adminStatus.isAdmin) return;
    setAuditStatus("");
    try {
      const rows = await listAdminAuditLog(settings, 30);
      setAuditLog(rows);
    } catch (error) {
      setAuditStatus(getErrorMessage(error, "Couldn't load admin audit log. Try again in a moment."));
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
      setSuggestionStatus(isMissingAdminSqlError(error.message) || /gh_admin_list_feature_suggestions|gh_feature_suggestions/i.test(String(error?.message || ""))
        ? "Suggestion SQL setup has not been run yet. Run the latest Supabase SQL setup, wait 30-60 seconds, then refresh."
        : getErrorMessage(error, "Couldn't load feature suggestions. Try again in a moment."));
    }
  }

  async function updateSuggestion(item, patch) {
    setSuggestionStatus("Updating suggestion...");
    try {
      await updateAdminFeatureSuggestion(settings, item.id, patch.status || item.status, patch.admin_note ?? item.admin_note ?? "");
      setSuggestionStatus("Suggestion updated.");
      await Promise.all([refreshSuggestions(), refreshAuditLog()]);
    } catch (error) {
      setSuggestionStatus(getErrorMessage(error, "Couldn't update suggestion. Try again in a moment."));
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
      setUserStatus(getErrorMessage(error, "Couldn't promote user. Try again in a moment."));
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
      setUserStatus(getErrorMessage(error, "Couldn't demote user. Try again in a moment."));
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
      setUserStatus(getErrorMessage(error, "Couldn't block user. Try again in a moment."));
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
      setUserStatus(getErrorMessage(error, "Couldn't unblock user. Try again in a moment."));
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
      setUserStatus(getErrorMessage(error, "Couldn't pause user. Try again in a moment."));
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
      setUserStatus(getErrorMessage(error, "Couldn't resume user. Try again in a moment."));
    }
  }

  async function saveMaintenanceStatus(nextEnabled) {
    setMaintenanceStatus(nextEnabled ? "Turning maintenance mode on..." : "Turning maintenance mode off...");
    try {
      await setAppStatus(settings, nextEnabled, maintenanceDraft);
      await Promise.all([actions.refreshAppNotices?.(), refreshAuditLog()]);
      setMaintenanceStatus(nextEnabled ? "Maintenance mode is ON for everyone except admins." : "Maintenance mode is OFF.");
    } catch (error) {
      setMaintenanceStatus(getErrorMessage(error, "Couldn't update maintenance mode. Try again in a moment."));
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
      setBroadcastStatus(getErrorMessage(error, "Couldn't send message. Try again in a moment."));
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
      setBroadcastStatus(getErrorMessage(error, "Couldn't clear message. Try again in a moment."));
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
              : getErrorMessage(error, "Couldn't load users. Try again in a moment."));
          }
        }),
        listAdminAuditLog(settings, 30).then(rows => {
          if (!cancelled) setAuditLog(rows);
        }).catch(error => {
          if (!cancelled) setAuditStatus(getErrorMessage(error, "Couldn't load admin audit log. Try again in a moment."));
        }),
        listAdminFeatureSuggestions(settings, suggestionFilter).then(rows => {
          if (!cancelled) setSuggestions(rows);
        }).catch(error => {
          if (!cancelled) {
            setSuggestions([]);
            setSuggestionStatus(/gh_admin_list_feature_suggestions|gh_feature_suggestions|schema cache|function .*not found|could not find the function/i.test(String(error?.message || ""))
              ? "Suggestion SQL setup has not been run yet. Run the latest Supabase SQL setup, wait 30-60 seconds, then refresh."
              : getErrorMessage(error, "Couldn't load feature suggestions. Try again in a moment."));
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

      <UsersAdminPanel
        adminStatus={adminStatus}
        adminUserCount={adminUserCount}
        blockUser={blockUser}
        blockedCount={blockedCount}
        demoteUser={demoteUser}
        filteredUsers={filteredUsers}
        pauseUser={pauseUser}
        pausedCount={pausedCount}
        promoteUser={promoteUser}
        refreshUsers={refreshUsers}
        resumeUser={resumeUser}
        setUserFilter={setUserFilter}
        setUserSearch={setUserSearch}
        unblockUser={unblockUser}
        userFilter={userFilter}
        userListLoaded={userListLoaded}
        userSearch={userSearch}
        userStatValue={userStatValue}
        userStatus={userStatus}
        users={users}
      />

      <SuggestionsAdminPanel
        refreshSuggestions={refreshSuggestions}
        setSuggestionFilter={setSuggestionFilter}
        suggestionFilter={suggestionFilter}
        suggestionStatus={suggestionStatus}
        suggestions={suggestions}
        updateSuggestion={updateSuggestion}
      />

      <FeatureFlagsPanel
        featureFlags={featureFlags}
        toggleFlag={toggleFlag}
      />

      <div className="control-centre-grid">
        <AppAccessPanel
          appNotices={appNotices}
          maintenanceDraft={maintenanceDraft}
          maintenanceStatus={maintenanceStatus}
          saveMaintenanceStatus={saveMaintenanceStatus}
          setMaintenanceDraft={setMaintenanceDraft}
        />

        <BroadcastPanel
          appNotices={appNotices}
          broadcastDraft={broadcastDraft}
          broadcastSeverity={broadcastSeverity}
          broadcastStatus={broadcastStatus}
          clearBroadcastMessage={clearBroadcastMessage}
          sendBroadcastMessage={sendBroadcastMessage}
          setBroadcastDraft={setBroadcastDraft}
          setBroadcastSeverity={setBroadcastSeverity}
        />
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
        <AuditLogPanel
          auditLog={auditLog}
          auditStatus={auditStatus}
        />

        <AdminAccessPanel
          accessStatus={accessStatus}
          adminStatus={adminStatus}
          toggleAdminClaimMode={toggleAdminClaimMode}
        />
      </div>
    </section>
  );
}
