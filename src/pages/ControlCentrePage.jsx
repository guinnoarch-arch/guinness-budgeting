import { useMemo } from "react";
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
  const adminStatus = actions.adminStatus || getAdminStatus(actions.cloudAuthSummary, settings);
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

  if (!adminStatus.isAdmin) {
    return (
      <section className="page-grid control-centre-page">
        <div className="card control-access-card">
          <p className="eyebrow">Control Centre</p>
          <h2>Admin access required</h2>
          <p className="muted-text">{adminStatus.reason}</p>
          <div className="cloud-status-message compact-status warning-status">
            Admin access is checked from Supabase user metadata or VITE_ADMIN_EMAILS. Browser-only checks are not a substitute for backend row-level security.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-grid control-centre-page">
      <div className="page-heading">
        <div>
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
              <h3>Safe Stats</h3>
              <p>Local counts only; no cross-user financial data is read here.</p>
            </div>
          </div>
          <div className="control-stat-grid">
            <ControlStat label="Local profiles" value={storageHealth.counts.profiles} />
            <ControlStat label="Local accounts" value={storageHealth.counts.accounts} />
            <ControlStat label="Local imports" value={storageHealth.counts.importBatches} />
            <ControlStat label="Admin-wide users" value="Secure RPC needed" detail="Add a backend RPC with row-level security before showing global user stats." />
          </div>
        </div>
      </div>

      <div className="card control-panel">
        <div className="panel-heading">
          <div>
            <h3>Feature Flags</h3>
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
              <h3>Security Checks</h3>
              <p>Checks that keep browser admin tools honest.</p>
            </div>
          </div>
          <div className="security-check-list">
            <SecurityCheck label="Admin account" ok={adminStatus.isAdmin} detail={adminStatus.reason} />
            <SecurityCheck label="Stable public URL" ok={publicUrlCheck.ok} detail={publicUrlCheck.detail} />
            <SecurityCheck label="Cloud backup config" ok={cloudConfigured} detail={cloudConfigured ? "Supabase cloud backup settings are present." : "Set Supabase URL and anon key before relying on cloud restore."} />
            <SecurityCheck label="Service worker update flow" ok={Boolean(actions.pwaInstall?.serviceWorkerReady || actions.pwaInstall?.hasUpdateAvailable)} detail={actions.pwaInstall?.hasUpdateAvailable ? "An update is ready to apply." : "Registered when supported; cache version changes with app releases."} />
            <SecurityCheck label="Global data access" ok={false} detail="No service-role key or cross-user financial data is available in the browser. Add a secure backend RPC before enabling global admin stats." />
          </div>
        </div>

        <div className="card control-panel">
          <div className="panel-heading">
            <div>
              <h3>Audit Log</h3>
              <p>Recent local admin changes.</p>
            </div>
          </div>
          <div className="admin-audit-list">
            {(settings.adminAuditLog || []).length === 0 ? (
              <p className="muted-text">No admin actions recorded yet.</p>
            ) : (
              settings.adminAuditLog.map(entry => (
                <div className="admin-audit-row" key={entry.id || `${entry.action}-${entry.createdAt}`}>
                  <strong>{entry.action}</strong>
                  <span>{entry.actorEmail || "unknown"} · {formatDateTime(entry.createdAt)}</span>
                  {entry.details && <small>{JSON.stringify(entry.details)}</small>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
