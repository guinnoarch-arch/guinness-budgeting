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
  getAdminStatus,
  getFeatureFlags,
  listAdminAuditLog,
  setAdminClaimMode,
  setFeatureFlag
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

  useEffect(() => {
    let cancelled = false;

    async function loadAuditLog() {
      if (!adminStatus.isAdmin) return;
      setAuditStatus("");
      try {
        const rows = await listAdminAuditLog(settings, 30);
        if (!cancelled) setAuditLog(rows);
      } catch (error) {
        if (!cancelled) setAuditStatus(error.message || "Could not load admin audit log.");
      }
    }

    loadAuditLog();
    return () => {
      cancelled = true;
    };
  }, [adminStatus.isAdmin, adminStatus.adminClaimEnabled, settings.cloudBackup?.supabaseUrl, settings.cloudBackup?.supabaseAnonKey]);

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
