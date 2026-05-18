import { useRef, useState } from "react";
import {
  APP_VERSION,
  DATA_SCHEMA_VERSION,
  buildRestoreComparisonWarnings,
  clearAppData,
  exportJsonBackup,
  exportRawSavedData,
  getBackupCounts,
  getBackupReminder,
  getStorageHealth,
  parseBackupFile,
  prepareDataForBackupExport,
  prepareRestoredAppData
} from "../services/storageService.js";
import { getInitialAppData } from "../data/exampleData.js";
import PwaInstallCard from "../components/settings/PwaInstallCard.jsx";

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function CountGrid({ counts }) {
  const labels = [
    ["transactions", "Transactions"],
    ["accounts", "Accounts"],
    ["categories", "Categories"],
    ["budgets", "Budgets"],
    ["recurringItems", "Recurring items"],
    ["savingsGoals", "Savings goals"],
    ["closedMonths", "Closed months"],
    ["accountAdjustments", "Account adjustments"],
    ["importBatches", "CSV import batches"],
    ["importRules", "Import rules"],
    ["transferRules", "Transfer rules"],
    ["externalAccountMappings", "External account mappings"]
  ];

  return (
    <div className="backup-count-grid">
      {labels.map(([key, label]) => (
        <div key={key} className="backup-count-card">
          <strong>{counts?.[key] ?? 0}</strong>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

function WarningList({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="backup-warning-box">
      <strong>Check before continuing</strong>
      <ul>
        {warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
      </ul>
    </div>
  );
}

function backupReminderClass(level) {
  if (level === "danger") return "storage-reminder danger";
  if (level === "warning") return "storage-reminder warning";
  if (level === "notice") return "storage-reminder notice";
  return "storage-reminder ok";
}

export default function SettingsPage({ appData, actions }) {
  const fileInputRef = useRef(null);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreError, setRestoreError] = useState("");
  const [restorePhrase, setRestorePhrase] = useState("");
  const [rawExportStatus, setRawExportStatus] = useState("");

  const currentCounts = getBackupCounts(appData);
  const storageHealth = getStorageHealth(appData);
  const settings = appData.settings || {};
  const profile = appData.profile || {};
  const backupReminder = getBackupReminder(settings.lastBackupAt);
  const comparisonWarnings = restorePreview
    ? buildRestoreComparisonWarnings(appData, restorePreview)
    : [];

  function updateProfileField(field, value) {
    const updatedAt = new Date().toISOString();
    const nextProfile = {
      ...profile,
      [field]: value,
      updatedAt
    };

    const nextSettings = {
      ...settings
    };

    if (field === "currency") {
      nextSettings.currency = value;
    }
    if (field === "currencySymbol") {
      nextSettings.currencySymbol = value;
    }
    if (field === "monthMode") {
      nextSettings.monthMode = value;
    }
    if (field === "customMonthStartDay") {
      nextSettings.customMonthStartDay = Number(value);
    }

    actions.updateAppData({
      ...appData,
      profile: nextProfile,
      settings: nextSettings
    });
  }

  function removeExampleData() {
    if (!confirm("Remove example data? Default categories and accounts will stay.")) return;
    actions.updateAppData({
      ...appData,
      transactions: appData.transactions.filter(item => !item.isExample),
      recurringItems: appData.recurringItems.filter(item => !item.isExample),
      savingsGoals: appData.savingsGoals.filter(item => !item.isExample),
      closedMonths: appData.closedMonths.filter(item => !item.isExample),
      settings: { ...settings, useExampleData: false }
    });
  }

  function resetAll() {
    const backupWarning = settings.lastBackupAt
      ? `Last backup: ${formatDateTime(settings.lastBackupAt)}. Continue only if this backup is recent enough.`
      : "No backup has been recorded. Export a backup before resetting unless you are sure.";

    if (!confirm(`${backupWarning}\n\nContinue to reset/delete all data?`)) return;

    const phrase = prompt("Type DELETE to reset all app data.");
    if (phrase !== "DELETE") return;
    clearAppData();
    actions.updateAppData(getInitialAppData());
    window.location.reload();
  }

  async function exportBackup() {
    const exportedAt = new Date().toISOString();
    const { nextData, filename } = prepareDataForBackupExport(appData, exportedAt);

    try {
      const result = await exportJsonBackup(nextData, exportedAt, filename);
      if (!result.ok) return;
      actions.updateAppData(nextData);
    } catch (error) {
      console.error("Backup failed:", error);
      alert("Backup export failed. Try again or use a different browser/download location.");
    }
  }

  async function exportRawData() {
    setRawExportStatus("");
    try {
      const result = await exportRawSavedData();
      if (!result.ok) {
        setRawExportStatus(result.cancelled ? "Raw data export cancelled." : "Raw data export did not complete.");
        return;
      }
      setRawExportStatus(result.method === "save-picker" ? "Raw data saved." : "Raw data downloaded.");
    } catch (error) {
      console.error("Raw data export failed:", error);
      setRawExportStatus("Raw data export failed.");
    }
  }

  async function handleBackupFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestorePreview(null);
    setRestorePhrase("");
    setRestoreError("");

    try {
      const preview = await parseBackupFile(file);
      setRestorePreview(preview);
    } catch (error) {
      setRestoreError(error.message || "Could not read this backup file.");
    } finally {
      event.target.value = "";
    }
  }

  function confirmRestore() {
    if (!restorePreview || restorePhrase !== "RESTORE") return;

    const restoredAt = new Date().toISOString();
    const nextData = prepareRestoredAppData(
      restorePreview.data,
      restorePreview.filename,
      restoredAt,
      restorePreview.meta
    );

    actions.updateAppData(nextData);
    setRestorePreview(null);
    setRestorePhrase("");
    alert("Backup restored. The app data has been replaced with the selected backup.");
  }

  return (
    <div className="page-grid">
      <div>
        <p className="eyebrow">Settings</p>
        <h2>App settings</h2>
      </div>

      <section className="card profile-settings-card">
        <div className="section-header compact-header">
          <div>
            <h3>Profile</h3>
            <p className="muted-text">Local profile details only. Passwords and login are deliberately not stored in this version.</p>
          </div>
          <span className="pill">Local profile</span>
        </div>

        <div className="form-grid profile-form-grid">
          <label>
            Name
            <input
              value={profile.displayName || ""}
              onChange={event => updateProfileField("displayName", event.target.value)}
              placeholder="e.g. Archie"
            />
          </label>

          <label>
            Email address optional
            <input
              type="email"
              value={profile.email || ""}
              onChange={event => updateProfileField("email", event.target.value)}
              placeholder="Used later for cloud login"
            />
          </label>

          <label>
            Budget/profile name
            <input
              value={profile.profileName || ""}
              onChange={event => updateProfileField("profileName", event.target.value)}
              placeholder="e.g. Personal Budget"
            />
          </label>

          <label>
            Profile type
            <select
              value={profile.profileType || "Personal"}
              onChange={event => updateProfileField("profileType", event.target.value)}
            >
              <option value="Personal">Personal</option>
              <option value="Student">Student</option>
              <option value="Household">Household</option>
              <option value="Shared house">Shared house</option>
              <option value="Family">Family</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label>
            Currency
            <select
              value={profile.currency || settings.currency || "GBP"}
              onChange={event => updateProfileField("currency", event.target.value)}
            >
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </label>

          <label>
            Currency symbol
            <input
              value={profile.currencySymbol || settings.currencySymbol || "£"}
              onChange={event => updateProfileField("currencySymbol", event.target.value)}
              placeholder="£"
            />
          </label>

          <label>
            Month mode
            <select
              value={profile.monthMode || settings.monthMode || "calendar"}
              onChange={event => updateProfileField("monthMode", event.target.value)}
            >
              <option value="calendar">Calendar month</option>
              <option value="custom">Custom/payday month</option>
            </select>
          </label>

          <label>
            Custom month start day
            <input
              type="number"
              min="1"
              max="28"
              value={profile.customMonthStartDay || settings.customMonthStartDay || 1}
              onChange={event => updateProfileField("customMonthStartDay", event.target.value)}
            />
          </label>

          <label className="full-width">
            Notes/details
            <textarea
              value={profile.notes || ""}
              onChange={event => updateProfileField("notes", event.target.value)}
              placeholder="Optional notes, e.g. personal budget, uni house bills, family account, etc."
            />
          </label>
        </div>

        <div className="profile-meta-grid">
          <p><span>Local profile ID</span><strong>{profile.localProfileId || "Not created yet"}</strong></p>
          <p><span>Cloud user ID</span><strong>{profile.cloudUserId || "Not connected"}</strong></p>
          <p><span>Profile updated</span><strong>{formatDateTime(profile.updatedAt)}</strong></p>
        </div>
      </section>

      <section className="card storage-health-card">
        <div className="section-header compact-header">
          <div>
            <h3>Storage health</h3>
            <p className="muted-text">Checks the local saved data before bigger storage or cloud-sync changes are added.</p>
          </div>
          <span className={storageHealth.ok ? "pill storage-ok" : "pill storage-bad"}>{storageHealth.status}</span>
        </div>

        <div className="storage-health-grid">
          <p><span>Storage type</span><strong>{storageHealth.storageType}</strong></p>
          <p><span>Storage key</span><strong>{storageHealth.storageKey}</strong></p>
          <p><span>Approx. size</span><strong>{storageHealth.approxKilobytes} KB</strong></p>
          <p><span>App version</span><strong>V{APP_VERSION}</strong></p>
          <p><span>Data version</span><strong>{settings.dataVersion || DATA_SCHEMA_VERSION}</strong></p>
          <p><span>Last backup</span><strong>{formatDateTime(settings.lastBackupAt)}</strong></p>
        </div>

        <div className={backupReminderClass(backupReminder.level)}>
          <strong>{backupReminder.title}</strong>
          <span>{backupReminder.message}</span>
        </div>

        <WarningList warnings={[...(storageHealth.errors || []), ...(storageHealth.warnings || [])]} />
      </section>

      <section className="card backup-status-card">
        <div className="section-header">
          <div>
            <h3>Data backup and restore</h3>
            <p className="muted-text">Export a full JSON backup before major changes, before resetting data, or before moving to another computer.</p>
          </div>
          <span className="pill">V{APP_VERSION}</span>
        </div>

        <div className="backup-status-grid">
          <div className="backup-status-item">
            <span>Last backup</span>
            <strong>{formatDateTime(settings.lastBackupAt)}</strong>
            {settings.lastBackupFilename && <small>{settings.lastBackupFilename}</small>}
          </div>
          <div className="backup-status-item">
            <span>Last restore</span>
            <strong>{formatDateTime(settings.lastRestoredAt)}</strong>
            {settings.lastRestoredFilename && <small>{settings.lastRestoredFilename}</small>}
          </div>
          <div className="backup-status-item">
            <span>Backup reminder</span>
            <strong>{backupReminder.title}</strong>
            <small>{backupReminder.ageDays === null ? "No reliable backup age" : `${backupReminder.ageDays} day(s) old`}</small>
          </div>
        </div>

        <h4>Current data summary</h4>
        <CountGrid counts={currentCounts} />

        <div className="backup-actions-row">
          <button className="primary-button" onClick={exportBackup}>Export full backup</button>
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>Import / restore backup</button>
          <button className="secondary-button" onClick={exportRawData}>Export emergency raw data</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden-file-input"
            onChange={handleBackupFile}
          />
        </div>

        {rawExportStatus && <p className="muted-text">{rawExportStatus}</p>}

        {restoreError && (
          <div className="restore-error-box">
            <strong>Restore failed</strong>
            <span>{restoreError}</span>
          </div>
        )}

        {restorePreview && (
          <div className="restore-preview-box">
            <div className="section-header">
              <div>
                <h4>Backup preview</h4>
                <p className="muted-text">Check this before restoring. Restore replaces all current data in this browser.</p>
              </div>
              <button className="icon-button" onClick={() => { setRestorePreview(null); setRestorePhrase(""); }}>×</button>
            </div>

            <div className="backup-meta-grid">
              <p><span>File</span><strong>{restorePreview.filename}</strong></p>
              <p><span>Exported</span><strong>{formatDateTime(restorePreview.meta.exportedAt)}</strong></p>
              <p><span>Backup format</span><strong>{restorePreview.meta.backupFormatVersion}</strong></p>
              <p><span>App version</span><strong>{restorePreview.meta.appVersion}</strong></p>
              <p><span>Data version</span><strong>{restorePreview.meta.dataSchemaVersion}</strong></p>
              <p><span>Source</span><strong>{restorePreview.meta.source}</strong></p>
              <p><span>Profile</span><strong>{restorePreview.profile?.displayName || restorePreview.profile?.profileName || "No profile name"}</strong></p>
            </div>

            <WarningList warnings={[...restorePreview.warnings, ...comparisonWarnings]} />

            <CountGrid counts={restorePreview.counts} />

            <label className="restore-confirm-label">
              Type RESTORE to replace current data
              <input
                value={restorePhrase}
                onChange={event => setRestorePhrase(event.target.value)}
                placeholder="RESTORE"
              />
            </label>

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => { setRestorePreview(null); setRestorePhrase(""); }}>Cancel</button>
              <button
                className="danger-button"
                onClick={confirmRestore}
                disabled={restorePhrase !== "RESTORE"}
              >
                Replace current data with this backup
              </button>
            </div>
          </div>
        )}
      </section>

      <PwaInstallCard />

      <section className="card">
        <h3>Example data</h3>
        <p>Remove fake transactions and example goals while keeping default categories/accounts.</p>
        <button className="secondary-button" onClick={removeExampleData}>Remove example data</button>
      </section>

      <section className="card danger-zone">
        <h3>Danger zone</h3>
        <p>Reset/delete all data. Export a backup first if you want a recovery copy.</p>
        <button className="danger-button" onClick={resetAll}>Reset all data</button>
      </section>

      <section className="card">
        <h3>Future features</h3>
        <p className="muted">Dark mode, full receipt storage, dashboard layout switching, cloud sync, and full desktop app wrapper are planned later. Bank CSV import is now available in V2.0.</p>
      </section>
    </div>
  );
}
